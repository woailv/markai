import { FolderCog, History, RefreshCw, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  DialogService,
  WorkspaceService,
} from "@/../bindings/prompttool/internal/services"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store"

import { RecentList } from "../recent/recent-list"
import { refreshRoot } from "./use-workspace-events"

/**
 * 顶部工具栏:切换根目录、手动刷新、按名称搜索过滤、显示/隐藏隐藏文件、折叠面板。
 * 切换根目录目前通过 prompt 输入路径;后续可替换为原生目录选择器。
 */
function getBaseName(p: string): string {
  if (!p) return "工作区"
  // 去除尾部分隔符
  const trimmed = p.replace(/[\\/]+$/, "")
  if (!trimmed) return "工作区"
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  if (idx < 0) return trimmed
  const base = trimmed.slice(idx + 1)
  return base || trimmed
}

function isCancelError(err: unknown): boolean {
  const msg = String(
    (err as { message?: string })?.message ?? err ?? "",
  ).toLowerCase()
  return msg.includes("cancel")
}

export function WorkspaceToolbar() {
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)
  const setSearchQuery = useWorkspaceStore((s) => s.setSearchQuery)
  const setRoot = useWorkspaceStore((s) => s.setRoot)
  const setWatchStatus = useWorkspaceStore((s) => s.setWatchStatus)
  const root = useWorkspaceStore((s) => s.root)

  const [searchOpen, setSearchOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const recentPanelRef = useRef<HTMLDivElement>(null)
  const recentBtnRef = useRef<HTMLButtonElement>(null)

  // 点击面板外部时自动关闭最近记录浮层
  useEffect(() => {
    if (!recentOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (recentPanelRef.current?.contains(target)) return
      if (recentBtnRef.current?.contains(target)) return
      setRecentOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [recentOpen])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshRoot()
    } finally {
      setRefreshing(false)
    }
  }, [])

  const handleChangeRoot = useCallback(async () => {
    let picked: string | undefined
    try {
      const res = await DialogService.PickDirectory({
        title: "选择工作区根目录",
        default: root,
      })
      if (!res || res.canceled || !res.path) return
      picked = res.path.trim()
    } catch (err) {
      // 用户取消选择:保留原状态,不设置错误
      if (isCancelError(err)) {
        console.debug("[workspace] PickDirectory canceled")
        return
      }
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

  return (
    <div className="relative shrink-0">
      <div className="flex h-9 items-center justify-between gap-1 border-b bg-muted/30 px-2">
        <span
          className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground"
          title={root || "工作区"}
        >
          {getBaseName(root)}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton
            title="搜索"
            active={searchOpen}
            onClick={() => {
              setSearchOpen((v) => {
                const next = !v
                if (!next) setSearchQuery("")
                return next
              })
            }}
          >
            <Search className="h-3 w-3" />
          </IconButton>
          <IconButton
            title="最近打开"
            active={recentOpen}
            onClick={() => setRecentOpen((v) => !v)}
            buttonRef={recentBtnRef}
          >
            <History className="h-3 w-3" />
          </IconButton>
          <IconButton title="刷新根目录" onClick={handleRefresh}>
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          </IconButton>
          <IconButton title="切换根目录" onClick={handleChangeRoot}>
            <FolderCog className="h-3 w-3" />
          </IconButton>
        </div>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-1 border-b bg-background px-2 py-1.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="按名称过滤"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              title="清除"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {recentOpen && (
        <div
          ref={recentPanelRef}
          className="absolute left-0 right-0 top-full z-20 max-h-[320px] overflow-hidden border-b border-l border-r bg-background shadow-md"
        >
          <div className="h-[300px]">
            <RecentList onPick={() => setRecentOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

function IconButton({
  title,
  onClick,
  active,
  children,
  buttonRef,
}: {
  title: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  )
}