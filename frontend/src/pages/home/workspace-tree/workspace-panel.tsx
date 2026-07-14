import { AlertTriangle, FolderPlus, Loader2, PanelLeftOpen } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { WorkspaceService } from "@/../bindings/prompttool/internal/services"
import { cn } from "@/lib/utils"
import { useWorkspaceStore, WORKSPACE_LAYOUT } from "@/store"

import { WorkspaceContextMenu } from "./context-menu"
import { WorkspaceToolbar } from "./toolbar"
import { TreeNode } from "./tree-node"
import type { ContextMenuState } from "./types"
import { refreshRoot, useWorkspaceEvents } from "./use-workspace-events"

/**
 * WorkspacePanel 工作区目录树的最外层容器。
 * - 折叠态渲染为窄条,点击展开;
 * - 展开态包含 Toolbar + 滚动的树 + 右侧可拖拽调整宽度的手柄。
 */
export function WorkspacePanel() {
  useWorkspaceEvents()

  const collapsed = useWorkspaceStore((s) => s.collapsed)
  const width = useWorkspaceStore((s) => s.width)
  const setCollapsed = useWorkspaceStore((s) => s.setCollapsed)
  const setWidth = useWorkspaceStore((s) => s.setWidth)

  if (collapsed) {
    return (
      <aside
        className="flex h-full shrink-0 flex-col items-center border-r bg-muted/20 py-2"
        style={{ width: WORKSPACE_LAYOUT.COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="展开工作区目录树"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r bg-muted/10"
      style={{ width }}
    >
      <WorkspaceToolbar />
      <TreeArea />
      <ResizeHandle width={width} onWidthChange={setWidth} />
    </aside>
  )
}

/** 树主体:根据 root 状态决定渲染空态/错误态/树。 */
function TreeArea() {
  const root = useWorkspaceStore((s) => s.root)
  const rootChildren = useWorkspaceStore((s) => s.rootChildren)
  const nodes = useWorkspaceStore((s) => s.nodes)
  const watchStatus = useWorkspaceStore((s) => s.watchStatus)
  const watchReason = useWorkspaceStore((s) => s.watchReason)
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)
  const showHidden = useWorkspaceStore((s) => s.showHidden)
  const expandAncestors = useWorkspaceStore((s) => s.expandAncestors)
  const setRoot = useWorkspaceStore((s) => s.setRoot)
  const setWatchStatus = useWorkspaceStore((s) => s.setWatchStatus)

  const [menu, setMenu] = useState<ContextMenuState | null>(null)

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

  const handleSelectRoot = useCallback(async () => {
    const input = window.prompt("输入工作区根目录(绝对路径):", "")
    if (!input) return
    try {
      const info = await WorkspaceService.SetRoot({ root: input.trim() })
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
  }, [setRoot, setWatchStatus])

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

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1">
        {!hasRoot ? (
          <EmptyRoot onChoose={handleSelectRoot} />
        ) : !rootAccessible ? (
          <MissingRoot reason={watchReason} onChoose={handleSelectRoot} />
        ) : rootChildren.length === 0 ? (
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
            />
          ))
        )}
      </div>

      {menu && (
        <WorkspaceContextMenu state={menu} onClose={() => setMenu(null)} />
      )}
    </div>
  )
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

/**
 * 右侧拖拽手柄:按下时全局监听 mousemove,实时更新 store 宽度。
 * 双击手柄恢复默认宽度。
 */
function ResizeHandle({
  width,
  onWidthChange,
}: {
  width: number
  onWidthChange: (w: number) => void
}) {
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWRef = useRef(0)

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    draggingRef.current = true
    startXRef.current = e.clientX
    startWRef.current = width
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const delta = e.clientX - startXRef.current
      onWidthChange(startWRef.current + delta)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [onWidthChange])

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={() => onWidthChange(WORKSPACE_LAYOUT.DEFAULT_WIDTH)}
      className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/30"
      role="separator"
      aria-orientation="vertical"
      title="拖拽调整宽度,双击恢复默认"
    />
  )
}