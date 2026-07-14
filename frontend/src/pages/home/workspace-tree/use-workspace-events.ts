import { Events } from "@wailsio/runtime"
import { useEffect, useRef } from "react"

import { WorkspaceService } from "@/../bindings/prompttool/internal/services"
import type { WorkspaceEntry } from "@/../bindings/prompttool/internal/services/models"
import { sortEntries, useWorkspaceStore } from "@/store"

import type { WorkspaceChangedEvent } from "./types"

/**
 * useWorkspaceEvents 负责:
 *  1) 首次挂载时拉取根目录状态与第一层内容
 *  2) 订阅 "workspace:changed" 事件并做增量更新
 *  3) 卸载时取消订阅
 *
 * 事件序号去重:后端事件推送与前端手动刷新可能竞态,
 * 保留最新 seq,更小的丢弃。
 */
export function useWorkspaceEvents() {
  const lastSeqRef = useRef<number>(-1)
  const store = useWorkspaceStore

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        // 优先使用前端持久化的 root(用户上次打开的目录),
        // 若与后端当前 root 不一致,则通过 SetRoot 恢复。
        const persistedRoot = store.getState().root
        let info = await WorkspaceService.Start()
        if (cancelled) return

        if (persistedRoot && persistedRoot.length > 0) {
          const backendRoot = info?.root ?? ""
          if (backendRoot !== persistedRoot) {
            try {
              const restored = await WorkspaceService.SetRoot({ root: persistedRoot })
              if (cancelled) return
              if (restored) info = restored
            } catch (err) {
              console.error("[workspace] restore persisted root failed", err)
              store.getState().setWatchStatus("error", String(err))
              return
            }
          }
        }

        if (info) {
          store.getState().setRoot(info.root)
          if (info.exists) {
            store.getState().setWatchStatus(
              info.degraded ? "degraded" : info.watching ? "watching" : "idle",
              info.reason,
            )
            await loadRootChildren()
          } else {
            store.getState().setWatchStatus("error", info.reason || "根目录不存在")
          }
        }
      } catch (err) {
        console.error("[workspace] bootstrap failed", err)
        store.getState().setWatchStatus("error", String(err))
      }
    }

    void bootstrap()

    const unsub = Events.On("workspace:changed", (evt) => {
      const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
      if (!payload) return
      const change = payload as WorkspaceChangedEvent
      if (typeof change.seq === "number") {
        if (change.seq <= lastSeqRef.current) return
        lastSeqRef.current = change.seq
      }
      handleChange(change)
    })

    return () => {
      cancelled = true
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

async function loadRootChildren() {
  const list = (await WorkspaceService.List({ path: "" })) || []
  const sorted = sortEntries(list)
  useWorkspaceStore.getState().upsertNodes(sorted)
  useWorkspaceStore.getState().setRootChildren(sorted.map((e) => e.path))
}

/**
 * 拉取某个目录一层子项,写入 store,并标记 loaded。
 * 供 tree-node 展开时调用,以及外部刷新使用。
 */
export async function loadDirectoryChildren(path: string): Promise<void> {
  const state = useWorkspaceStore.getState()
  state.setNodeLoading(path, true)
  try {
    const list = (await WorkspaceService.List({ path })) || []
    const sorted = sortEntries(list)
    useWorkspaceStore.getState().upsertNodes(sorted)
    useWorkspaceStore.getState().setChildren(
      path,
      sorted.map((e) => e.path),
    )
  } catch (err) {
    console.error("[workspace] list failed", path, err)
    useWorkspaceStore.getState().setNodeLoading(path, false, String(err))
  }
}

export async function refreshDirectoryChildren(path: string): Promise<void> {
  const state = useWorkspaceStore.getState()
  state.setNodeLoading(path, true)
  try {
    const list = (await WorkspaceService.Refresh({ path })) || []
    const sorted = sortEntries(list)
    useWorkspaceStore.getState().upsertNodes(sorted)
    useWorkspaceStore.getState().setChildren(
      path,
      sorted.map((e) => e.path),
    )
  } catch (err) {
    console.error("[workspace] refresh failed", path, err)
    useWorkspaceStore.getState().setNodeLoading(path, false, String(err))
  }
}

export async function refreshRoot(): Promise<void> {
  const list = (await WorkspaceService.Refresh({ path: "" })) || []
  const sorted = sortEntries(list)
  useWorkspaceStore.getState().upsertNodes(sorted)
  useWorkspaceStore.getState().setRootChildren(sorted.map((e) => e.path))
}

/**
 * 根据事件类型做增量更新。
 * 若受影响父目录尚未加载,则跳过(展开时会重新拉取)。
 */
function handleChange(evt: WorkspaceChangedEvent) {
  const state = useWorkspaceStore.getState()
  const { root, nodes, rootChildren } = state

  switch (evt.type) {
    case "create":
      if (evt.entry) insertEntry(evt.parent, evt.entry)
      break

    // 后端常量为 "remove"(WorkspaceChangeRemove);保留 "delete" 兼容。
    case "remove":
    case "delete":
      state.removeSubtree(evt.path)
      break

    // fsnotify 的 rename 事件只带旧路径,新名字随后通过独立的 create 事件到达。
    // 因此这里等价于"移除旧路径"。若未来后端支持 oldPath+新 entry,则走 move 分支。
    case "rename":
      if (evt.oldPath) {
        state.removeSubtree(evt.oldPath)
      } else {
        state.removeSubtree(evt.path)
      }
      if (evt.entry) {
        insertEntry(evt.parent, evt.entry)
      }
      break

    case "move": {
      // 删旧 + 插新;尽量迁移展开态
      const wasExpanded =
        evt.oldPath !== undefined && state.expanded.has(evt.oldPath)
      const wasSelected = state.selectedPath === evt.oldPath
      if (evt.oldPath) state.removeSubtree(evt.oldPath)
      if (evt.entry) {
        insertEntry(evt.parent, evt.entry)
        if (wasExpanded && evt.entry.isDir) {
          useWorkspaceStore.getState().setExpanded(evt.entry.path, true)
        }
        if (wasSelected) {
          useWorkspaceStore.getState().setSelected(evt.entry.path)
        }
      }
      break
    }

    case "modify":
      if (evt.entry) {
        // 仅更新元数据字段(size / modTime),保留 children / loaded
        useWorkspaceStore.getState().upsertNodes([evt.entry])
      }
      break

    default:
      break
  }

  // 消除未使用变量告警
  void root
  void nodes
  void rootChildren
}

/**
 * 把一个新 entry 插入到父节点的 childrenPaths 中,保持排序。
 * 父目录若尚未加载(loaded=false),则忽略 —— 等下次展开会全量拉取。
 */
function insertEntry(parentPath: string, entry: WorkspaceEntry) {
  const state = useWorkspaceStore.getState()
  const { root, nodes, rootChildren } = state

  // 先写入节点元数据
  state.upsertNodes([entry])

  const isRootChild = parentPath === root || parentPath === "" || parentPath === entry.parent && !nodes[parentPath]
  if (parentPath === root) {
    const nextPaths = mergeSorted(rootChildren, entry, nodes)
    state.setRootChildren(nextPaths)
    return
  }

  const parent = nodes[parentPath]
  if (!parent) return
  if (!parent.loaded) return // 未加载过,跳过增量插入

  const nextPaths = mergeSorted(parent.childrenPaths, entry, nodes)
  state.setChildren(parentPath, nextPaths)

  void isRootChild
}

/**
 * 把 entry 合并到已排序的路径数组中(目录在前、名称字典序)。
 * 若已存在同名路径,替换其位置。
 */
function mergeSorted(
  paths: string[],
  entry: WorkspaceEntry,
  nodes: Record<string, { entry: WorkspaceEntry }>,
): string[] {
  const filtered = paths.filter((p) => p !== entry.path)
  const items = filtered
    .map((p) => nodes[p]?.entry)
    .filter((e): e is WorkspaceEntry => !!e)
  items.push(entry)
  items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  })
  return items.map((e) => e.path)
}