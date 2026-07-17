import {
  AlertTriangle,
  FolderPlus,
  Loader2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  DialogService,
  WorkspaceService,
} from "@/../bindings/prompttool/internal/services"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store"

import { WorkspaceContextMenu } from "./context-menu"
import {
  deletePaths,
  siblingNamesOf,
} from "./file-ops"
import { InlineNameEditor } from "./inline-name-editor"
import { computeVisibleOrder, emitFilesDropped } from "./selection-utils"
import { ToastHost } from "./toast"
import { WorkspaceToolbar } from "./toolbar"
import { TreeNode } from "./tree-node"
import type { ContextMenuState } from "./types"
import { useEditingStore } from "./use-editing-state"
import {
  createDirectory as createDirOp,
  createFile as createFileOp,
} from "./file-ops"
import { refreshRoot, useWorkspaceEvents } from "./use-workspace-events"

/**
 * WorkspacePanel 工作区目录树的内容体。
 * - 折叠态不渲染(由父级 ResizablePanelGroup 决定是否包含此面板);
 * - 宽度调整由父级的 ResizableHandle 负责,本组件不再关心尺寸。
 */
export function WorkspacePanel() {
  useWorkspaceEvents()

  const collapsed = useWorkspaceStore((s) => s.collapsed)

  // 折叠时完全不渲染,避免侧边占位(Zed 风格,由底部状态栏统一控制显隐)。
  if (collapsed) return null

  return (
    <aside className="relative flex h-full min-w-0 flex-1 flex-col border-r bg-muted/10">
      <WorkspaceToolbar />
      <TreeArea />
      <ToastHost />
    </aside>
  )
}

/** 树主体:根据 root 状态决定渲染空态/错误态/树。 */
function TreeArea() {
  const root = useWorkspaceStore((s) => s.root)
  const rootChildren = useWorkspaceStore((s) => s.rootChildren)
  const nodes = useWorkspaceStore((s) => s.nodes)
  const expanded = useWorkspaceStore((s) => s.expanded)
  const watchStatus = useWorkspaceStore((s) => s.watchStatus)
  const watchReason = useWorkspaceStore((s) => s.watchReason)
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)
  const showHidden = useWorkspaceStore((s) => s.showHidden)
  const expandAncestors = useWorkspaceStore((s) => s.expandAncestors)
  const setRoot = useWorkspaceStore((s) => s.setRoot)
  const setWatchStatus = useWorkspaceStore((s) => s.setWatchStatus)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const editing = useEditingStore((s) => s.editing)
  const clearEditing = useEditingStore((s) => s.clear)
  const selectedPath = useWorkspaceStore((s) => s.selectedPath)
  const selectedPaths = useWorkspaceStore((s) => s.selectedPaths)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const query = searchQuery.trim().toLowerCase()
  const matcher = useCallback(
    (name: string) => (query ? name.toLowerCase().includes(query) : false),
    [query],
  )

  /**
   * branchHasMatch 判断以 path 为根的子树内是否有名字命中查询的节点。
   * 无查询时始终返回 true(不做过滤)。
   * 仅遍历已加载的子项;未加载的目录默认视为可能命中(避免误折叠)。
   */
  const branchHasMatch = useCallback(
    (path: string): boolean => {
      if (!query) return true
      const node = nodes[path]
      if (!node) return false
      const { entry } = node
      if (!showHidden && entry.isHidden) return false
      if (matcher(entry.name)) return true
      if (!entry.isDir) return false
      if (!node.loaded) return true
      for (const child of node.childrenPaths) {
        if (branchHasMatch(child)) return true
      }
      return false
    },
    [matcher, nodes, query, showHidden],
  )

  // 搜索时自动展开命中节点的所有祖先
  useEffect(() => {
    if (!query) return
    for (const path of Object.keys(nodes)) {
      const node = nodes[path]
      if (matcher(node.entry.name)) {
        expandAncestors(path)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string, isDir: boolean) => {
      setMenu({ x: e.clientX, y: e.clientY, targetPath: path, isDir })
    },
    [],
  )

  /**
   * Delete 快捷键:优先使用多选集合,退回主选。
   * 若正处于内联编辑或没有 root,不触发。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return
      if (editing) return
      // 输入框/可编辑区聚焦时忽略
      const active = document.activeElement as HTMLElement | null
      if (active) {
        const tag = active.tagName
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          active.isContentEditable
        )
          return
      }
      const targets =
        selectedPaths.size > 0
          ? Array.from(selectedPaths)
          : selectedPath
            ? [selectedPath]
            : []
      if (targets.length === 0) return
      e.preventDefault()
      setDeleteTargets(targets)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editing, selectedPath, selectedPaths])

  const confirmDelete = useCallback(async () => {
    if (!deleteTargets || deleteTargets.length === 0) return
    setDeleting(true)
    try {
      await deletePaths(deleteTargets)
    } finally {
      setDeleting(false)
      setDeleteTargets(null)
    }
  }, [deleteTargets])

  // 删除确认描述文本
  const deleteDescription = useMemo(() => {
    if (!deleteTargets) return null
    const names = deleteTargets.map(basenameOf)
    const preview = names.slice(0, 5).join("、")
    const rest = names.length > 5 ? ` 等 ${names.length} 项` : ""
    return (
      <>
        <div>
          将删除以下 {names.length} 项(目录会递归删除):「{preview}
          {rest}」。此操作无法撤销。
        </div>
      </>
    )
  }, [deleteTargets])

  // 根级内联新建输入行
  const rootCreatingIsDir =
    editing?.kind === "create" && editing.parentPath === root
      ? editing.isDir
      : null

  /** 组件持有的可见顺序计算器,交给 TreeNode 做 Shift 区间选择用。 */
  const getVisibleOrder = useCallback(
    () =>
      computeVisibleOrder(
        rootChildren,
        nodes,
        expanded,
        showHidden,
        query,
        matcher,
        branchHasMatch,
      ),
    [rootChildren, nodes, expanded, showHidden, query, matcher, branchHasMatch],
  )

  /**
   * 从树里拖出条目:若当前节点已在多选内,则整个多选被拖走;
   * 否则仅拖走该节点。落点由 dragend + elementsFromPoint 决定,
   * 通过 files:dropped 事件复用输入框/编辑器现成的插入逻辑。
   */
  const handleDragStart = useCallback((e: React.DragEvent, path: string) => {
    const state = useWorkspaceStore.getState()
    const selected = state.selectedPaths.has(path)
      ? Array.from(state.selectedPaths)
      : [path]
    e.dataTransfer.effectAllowed = "copy"
    // 写点内容以让浏览器认为这是有效拖拽(实际不消费)
    try {
      e.dataTransfer.setData("application/x-workspace-paths", JSON.stringify(selected))
    } catch {
      /* ignore */
    }

    const target = e.currentTarget as HTMLElement
    const handleEnd = (ev: DragEvent) => {
      target.removeEventListener("dragend", handleEnd)
      emitFilesDropped(selected, { x: ev.clientX, y: ev.clientY })
    }
    target.addEventListener("dragend", handleEnd)
  }, [])

  const handleBlankMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 点击空白区域(不是节点)时清空多选
      if (e.target === e.currentTarget) {
        clearSelection()
      }
    },
    [clearSelection],
  )

  const handleSelectRoot = useCallback(async () => {
    let picked: string | undefined
    try {
      const res = await DialogService.PickDirectory({
        title: "选择工作区根目录",
        default: root,
      })
      if (!res || res.canceled || !res.path) return
      picked = res.path.trim()
    } catch (err) {
      console.error("[workspace] PickDirectory failed", err)
      setWatchStatus("error", String(err))
      return
    }
    if (!picked) return
    try {
      const info = await WorkspaceService.SetRoot({ root: picked })
      if (info) {
        setRoot(info.root)
        if (info.exists) {
          setWatchStatus(
            info.degraded ? "degraded" : info.watching ? "watching" : "idle",
            info.reason,
          )
          await refreshRoot()
        } else {
          setWatchStatus("error", info.reason || "根目录不存在")
        }
      }
    } catch (err) {
      console.error("[workspace] SetRoot failed", err)
      setWatchStatus("error", String(err))
    }
  }, [root, setRoot, setWatchStatus])

  const hasRoot = root && root.length > 0
  const rootAccessible = watchStatus !== "error"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {watchStatus === "degraded" && (
        <StatusBar
          tone="warn"
          message="实时同步不可用,已降级为轮询"
          detail={watchReason}
        />
      )}
      {watchStatus === "error" && hasRoot && (
        <StatusBar tone="error" message="监听失败" detail={watchReason} />
      )}

      <div
        ref={scrollAreaRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1"
        onMouseDown={handleBlankMouseDown}
      >
        {!hasRoot ? (
          <EmptyRoot onChoose={handleSelectRoot} />
        ) : !rootAccessible ? (
          <MissingRoot reason={watchReason} onChoose={handleSelectRoot} />
        ) : (
          <>
            {rootCreatingIsDir !== null && (
              <InlineNameEditor
                depth={0}
                initialName=""
                isDir={rootCreatingIsDir}
                siblingNames={siblingNamesOf(root)}
                onSubmit={async (name) => {
                  const res = rootCreatingIsDir
                    ? await createDirOp(root, name)
                    : await createFileOp(root, name)
                  if (res.ok) clearEditing()
                }}
                onCancel={clearEditing}
              />
            )}
            {rootChildren.length === 0 && rootCreatingIsDir === null ? (
              <RootLoading />
            ) : (
              rootChildren.map((path) => (
                <TreeNode
                  key={path}
                  path={path}
                  depth={0}
                  onContextMenu={handleContextMenu}
                  matcher={matcher}
                  branchHasMatch={branchHasMatch}
                  getVisibleOrder={getVisibleOrder}
                  onDragStart={handleDragStart}
                />
              ))
            )}
          </>
        )}
      </div>

      {menu && (
        <WorkspaceContextMenu
          state={menu}
          onClose={() => setMenu(null)}
          onRequestDelete={(paths) => setDeleteTargets(paths)}
        />
      )}
      <AlertDialog
        open={!!deleteTargets}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteTargets(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                // 阻止默认关闭:等 confirmDelete 完成后再由自身清空 deleteTargets
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "删除中…" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function basenameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"))
  return idx >= 0 ? p.slice(idx + 1) : p
}

function StatusBar({
  tone,
  message,
  detail,
}: {
  tone: "warn" | "error"
  message: string
  detail?: string
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 border-b px-2 py-1 text-[11px]",
        tone === "warn"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-destructive/10 text-destructive",
      )}
    >
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{message}</div>
        {detail && (
          <div className="mt-0.5 truncate opacity-80" title={detail}>
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyRoot({ onChoose }: { onChoose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FolderPlus className="h-5 w-5" />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        尚未设置工作区根目录
      </p>
      <button
        type="button"
        onClick={onChoose}
        className="rounded-md border bg-background px-3 py-1 text-xs hover:bg-muted"
      >
        选择目录
      </button>
    </div>
  )
}

function MissingRoot({
  reason,
  onChoose,
}: {
  reason?: string
  onChoose: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-foreground">根目录不可访问</p>
        {reason && (
          <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-muted-foreground">
            {reason}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onChoose}
        className="rounded-md border bg-background px-3 py-1 text-xs hover:bg-muted"
      >
        重新选择
      </button>
    </div>
  )
}

function RootLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>加载中…</span>
    </div>
  )
}