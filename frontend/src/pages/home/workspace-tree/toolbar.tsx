import {
  Eye,
  EyeOff,
  FolderCog,
  PanelLeftClose,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { useCallback, useState } from "react"

import {
  DialogService,
  WorkspaceService,
} from "@/../bindings/prompttool/internal/services"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store"

import { refreshRoot } from "./use-workspace-events"

/**
 * 顶部工具栏:切换根目录、手动刷新、按名称搜索过滤、显示/隐藏隐藏文件、折叠面板。
 * 切换根目录目前通过 prompt 输入路径;后续可替换为原生目录选择器。
 */
export function WorkspaceToolbar() {
  const showHidden = useWorkspaceStore((s) => s.showHidden)
  const setShowHidden = useWorkspaceStore((s) => s.setShowHidden)
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)
  const setSearchQuery = useWorkspaceStore((s) => s.setSearchQuery)
  const setCollapsed = useWorkspaceStore((s) => s.setCollapsed)
  const setRoot = useWorkspaceStore((s) => s.setRoot)
  const setWatchStatus = useWorkspaceStore((s) => s.setWatchStatus)
  const root = useWorkspaceStore((s) => s.root)

  const [searchOpen, setSearchOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

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
    <div className="flex flex-col gap-1 border-b bg-background px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          工作区
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
            title={showHidden ? "隐藏点开头文件" : "显示隐藏文件"}
            active={showHidden}
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </IconButton>
          <IconButton title="刷新根目录" onClick={handleRefresh}>
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          </IconButton>
          <IconButton title="切换根目录" onClick={handleChangeRoot}>
            <FolderCog className="h-3 w-3" />
          </IconButton>
          <IconButton title="收起面板" onClick={() => setCollapsed(true)}>
            <PanelLeftClose className="h-3 w-3" />
          </IconButton>
        </div>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-1 rounded border bg-background px-1.5 py-1">
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
    </div>
  )
}

function IconButton({
  title,
  onClick,
  active,
  children,
}: {
  title: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
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