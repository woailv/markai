import { Events } from "@wailsio/runtime"
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
import { useWorkspaceStore } from "../model/workspace.store"

import { WorkspaceContextMenu } from "./context-menu"
import {
  deletePaths,
  siblingNamesOf,
} from "../model/file-ops"
import { InlineNameEditor } from "./inline-name-editor"
import {
  copyPathsToSystemClipboard,
  pasteFromClipboardData,
  pasteFromPaths,
  pasteFromSystemClipboard,
} from "../model/paste-actions"
import { resolvePasteTarget, resolveTargetFromElement } from "../model/paste-target"
import {
  computeVisibleOrder,
  emitFilesDropped,
  findDropTargetAtPoint,
} from "../model/selection-utils"
import { ToastHost, toast } from "./toast"
import { WorkspaceToolbar } from "./toolbar"
import { TreeNode } from "./tree-node"
import type { ContextMenuState } from "../model/types"
import { useEditingStore } from "../model/use-editing-state"
import {
  createDirectory as createDirOp,
  createFile as createFileOp,
} from "../model/file-ops"
import { refreshRoot, useWorkspaceEvents } from "../model/use-workspace-events"

/** DataTransfer 中承载"应用内选中路径"的自定义 MIME。 */
const INTERNAL_MIME = "application/x-workspace-paths"

/** 判断当前焦点是否在真正的输入区域,决定是否要放行原生行为。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA") return true
  if (target.isContentEditable) return true
  if (target.closest(".cm-editor")) return true
  if (target.closest("[contenteditable='true']")) return true
  return false
}

/**
 * WorkspacePanel 工作区目录树的内容体。
 * - 折叠态不渲染(由父级 ResizablePanelGroup 决定是否包含此面板);
 * - 宽度调整由父级的 ResizableHandle 负责,本组件不再关心尺寸。
 */
export interface WorkspacePanelProps {
  /**
   * 顶部工具栏 "最近打开" 浮层的注入器,由页面组合层提供。
   * 保持 features/workspace 不反向依赖 widgets。
   */
  renderRecent?: (onPick: () => void) => React.ReactNode
}

export function WorkspacePanel({ renderRecent }: WorkspacePanelProps = {}) {
  useWorkspaceEvents()

  const collapsed = useWorkspaceStore((s) => s.collapsed)

  // 折叠时完全不渲染,避免侧边占位(Zed 风格,由底部状态栏统一控制显隐)。
  if (collapsed) return null

  return (
    <aside className="relative flex h-full min-w-0 flex-1 flex-col border-r bg-muted/10">
      <WorkspaceToolbar renderRecent={renderRecent} />
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
   * 否则仅拖走该节点。
   *
   * DataTransfer 承载两份数据以覆盖不同接收方:
   *  - INTERNAL_MIME:应用内识别(面板 onDrop 优先读)
   *  - text/plain:降级 / 外部编辑器
   *
   * dragend 仅在落点命中"非工作区"的 data-file-drop-target 时,才通过
   * files:dropped 通知输入框(RichEditor 家族)插入路径。这样:
   *  - 只有真正拖到输入框内才会写入路径,与外部文件拖入输入框行为一致;
   *  - 拖到工作区/无效区域时不再误插;
   *  - 工作区内部的移动/复制仍由本面板 onDrop 通过 INTERNAL_MIME 完成。
   */
  const handleDragStart = useCallback((e: React.DragEvent, path: string) => {
    const state = useWorkspaceStore.getState()
    const selected = state.selectedPaths.has(path)
      ? Array.from(state.selectedPaths)
      : [path]
    e.dataTransfer.effectAllowed = "copyMove"
    try {
      const payload = JSON.stringify(selected)
      e.dataTransfer.setData(INTERNAL_MIME, payload)
      e.dataTransfer.setData("text/plain", selected.join("\n"))
    } catch {
      /* ignore */
    }

    const target = e.currentTarget as HTMLElement
    const handleEnd = (ev: DragEvent) => {
      target.removeEventListener("dragend", handleEnd)
      const dropTarget = findDropTargetAtPoint(ev.clientX, ev.clientY)
      if (!dropTarget) return
      // 落点在工作区自身:不 emit,内部拖动由 onDrop 走 INTERNAL_MIME 处理
      if (scrollAreaRef.current && scrollAreaRef.current === dropTarget) return
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

  // ---- 拖入(系统资源管理器 / 应用内)与剪贴板粘贴 ----

  const [dragOver, setDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const lastPasteAtRef = useRef(0)

  /** 200ms 内的 Ctrl+V 只触发一次,防止长按/重复触发。 */
  const shouldDebouncePaste = useCallback(() => {
    const now = Date.now()
    if (now - lastPasteAtRef.current < 200) return true
    lastPasteAtRef.current = now
    return false
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    // 只在真的携带数据时高亮
    const types = e.dataTransfer?.types
    if (!types) return
    if (
      !Array.from(types).some(
        (t) =>
          t === "Files" ||
          t === "text/uri-list" ||
          t === INTERNAL_MIME,
      )
    ) {
      return
    }
    dragCounterRef.current += 1
    setDragOver(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // 拒绝没有可识别载荷的拖拽
    const types = e.dataTransfer?.types
    if (!types) return
    if (
      !Array.from(types).some(
        (t) =>
          t === "Files" ||
          t === "text/uri-list" ||
          t === INTERNAL_MIME,
      )
    ) {
      return
    }
    e.preventDefault()
    // 应用内且按 Shift → move;否则 copy
    const isInternal = Array.from(types).includes(INTERNAL_MIME)
    if (isInternal && e.shiftKey) {
      e.dataTransfer.dropEffect = "move"
    } else {
      e.dataTransfer.dropEffect = "copy"
    }
  }, [])

  const handleDragLeave = useCallback((_e: React.DragEvent) => {
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setDragOver(false)

      const dt = e.dataTransfer
      if (!dt) return

      const target = resolveTargetFromElement(e.target) ?? resolvePasteTarget()
      if (!target) {
        toast.error("无法粘贴", "未设置工作区目录")
        return
      }

      // 优先识别应用内拖拽
      const internal = safeReadData(dt, INTERNAL_MIME)
      if (internal) {
        let paths: string[] = []
        try {
          const parsed = JSON.parse(internal)
          if (Array.isArray(parsed))
            paths = parsed.filter((p) => typeof p === "string")
        } catch {
          /* ignore */
        }
        if (paths.length === 0) return
        // 应用内默认 copy,按住 Shift 改为 cut(移动)
        // 注:与 IDEA 不同(IDEA 默认移动,按 Ctrl 复制);此处按快捷键更少歧义的约定。
        const cut = e.shiftKey
        await pasteFromPaths(paths, target, cut)
        return
      }

      // 外部资源管理器拖入:Wails 开启 EnableFileDrop 后,原生层已拦截 drop
      // 并另行触发 files:dropped 事件(带真实绝对路径),真正的复制统一走下面
      // 的 files:dropped 监听器,避免与之在此重复处理导致双份粘贴。参照 IDEA:
      // 外部文件拖入工作区即复制到目标目录。
    },
    [],
  )

  // 外部资源管理器拖入工作区:走 Wails EnableFileDrop 通道,原生层派发
  // files:dropped 事件(带绝对路径)。这里以"落点是否在工作区滚动区"
  // 判定归属,与输入框侧的 winner 检测保持一致,避免与 RichEditor 抢事件。
  useEffect(() => {
    const unsub = Events.On("files:dropped", (evt) => {
      const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
      const paths: string[] = payload?.paths ?? []
      if (!paths.length) return
      const root = scrollAreaRef.current
      if (!root) return

      const hasCoords =
        payload.hasCoords &&
        payload.x !== undefined &&
        payload.y !== undefined
      if (!hasCoords) return

      const dropTarget = findDropTargetAtPoint(payload.x, payload.y)
      if (dropTarget !== root) return

      // 用命中的具体节点做目标目录解析(文件 → 父目录,目录 → 自身);
      // 落在空白处时 resolveTargetFromElement 会退回 resolvePasteTarget()。
      const stack = document.elementsFromPoint(payload.x, payload.y)
      const target = resolveTargetFromElement(stack[0] ?? null)
      if (!target) {
        toast.error("无法粘贴", "未设置工作区目录")
        return
      }
      // 参照 IDEA:外部文件拖入即复制到目标目录(不做剪切)
      void pasteFromPaths(paths, target, false)
    })
    return () => {
      unsub()
    }
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (isEditableTarget(e.target)) return
    const target = resolvePasteTarget()
    if (!target) return
    if (shouldDebouncePaste()) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    // 优先走后端系统剪贴板(支持文件引用与 Windows 剪切语义);
    // 若剪贴板中不含文件引用,再降级为 DataTransfer(如剪贴板图片)。
    void pasteFromSystemClipboard(target).then((written) => {
      if (written.length === 0) {
        void pasteFromClipboardData(e.clipboardData, target)
      }
    })
  }, [shouldDebouncePaste])

  // 键盘剪贴板:Ctrl/Cmd + C / V,通过后端系统剪贴板通道执行。
  // 绑定到 window,焦点检测放到回调里。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key !== "c" && key !== "v") return

      // 焦点在编辑器/输入框内直接放行
      if (isEditableTarget(document.activeElement)) return

      // 面板容器未获得焦点也不管(避免抢全局)
      const panel = panelRootRef.current
      if (!panel) return
      if (!panel.contains(document.activeElement)) return

      if (key === "c") {
        const state = useWorkspaceStore.getState()
        const paths =
          state.selectedPaths.size > 0
            ? Array.from(state.selectedPaths)
            : state.selectedPath
              ? [state.selectedPath]
              : []
        if (paths.length === 0) return
        e.preventDefault()
        void copyPathsToSystemClipboard(paths)
        return
      }

      // key === "v"
      if (shouldDebouncePaste()) {
        e.preventDefault()
        return
      }
      const target = resolvePasteTarget()
      if (!target) {
        toast.error("无法粘贴", "未设置工作区目录")
        e.preventDefault()
        return
      }
      e.preventDefault()
      void pasteFromSystemClipboard(target)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editing, shouldDebouncePaste])

  const panelRootRef = useRef<HTMLDivElement>(null)

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
    <div
      ref={panelRootRef}
      className="flex min-h-0 flex-1 flex-col outline-none"
      tabIndex={0}
      onPaste={handlePaste}
    >
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
        data-file-drop-target="true"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1 transition-colors",
          dragOver &&
            "bg-primary/5 outline outline-2 -outline-offset-2 outline-primary/40",
        )}
        onMouseDown={handleBlankMouseDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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

function safeReadData(dt: DataTransfer, type: string): string {
  try {
    return dt.getData(type) || ""
  } catch {
    return ""
  }
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