import { Clock, FolderOpen, Trash2, X } from "lucide-react"
import { useEffect } from "react"

import {
  DialogService,
  WorkspaceService,
} from "@/../bindings/prompttool/internal/services"
import type { RecentItem } from "@/../bindings/prompttool/internal/services/models"
import { cn } from "@/lib/utils"
import { useRecentStore, useWorkspaceStore } from "@/store"

import { refreshRoot } from "../workspace-tree/use-workspace-events"

/**
 * RecentList 展示后端持久化的"最近打开"目录/文件列表。
 * - 点击条目:若为 dir,设为工作区根目录
 * - 悬停显示 移除 按钮
 * - 空状态提供"打开目录"入口
 * - onPick:成功切换根目录/选择目录后回调,供浮层自动关闭
 */
export function RecentList({ onPick }: { onPick?: () => void } = {}) {
  const items = useRecentStore((s) => s.items)
  const loading = useRecentStore((s) => s.loading)
  const loaded = useRecentStore((s) => s.loaded)
  const error = useRecentStore((s) => s.error)
  const load = useRecentStore((s) => s.load)
  const remove = useRecentStore((s) => s.remove)
  const clear = useRecentStore((s) => s.clear)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const isEmpty = !loading && items.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b bg-muted/30 px-2">
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          最近打开
        </span>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => void clear()}
            title="清空最近记录"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !loaded && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            加载中…
          </div>
        )}

        {error && (
          <div className="px-3 py-2 text-xs text-destructive">{error}</div>
        )}

        {isEmpty && <EmptyState />}

        {items.length > 0 && (
          <ul className="py-1">
            {items.map((item) => (
              <RecentRow
                key={item.id}
                item={item}
                onRemove={() => void remove(item.id)}
                onPick={onPick}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function RecentRow({
  item,
  onRemove,
  onPick,
}: {
  item: RecentItem
  onRemove: () => void
  onPick?: () => void
}) {
  const setRoot = useWorkspaceStore((s) => s.setRoot)
  const setWatchStatus = useWorkspaceStore((s) => s.setWatchStatus)

  const handleOpen = async () => {
    if (item.kind !== "dir") return
    try {
      const info = await WorkspaceService.SetRoot({ root: item.path })
      if (!info) return
      setRoot(info.root)
      if (info.exists) {
        setWatchStatus(
          info.degraded ? "degraded" : info.watching ? "watching" : "idle",
          info.reason,
        )
        await refreshRoot()
      } else {
        setWatchStatus("error", info.reason || "路径不存在")
      }
      onPick?.()
    } catch (err) {
      console.error("[recent] open failed", err)
      setWatchStatus("error", String(err))
    }
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={handleOpen}
        title={item.path}
        className={cn(
          "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/60",
        )}
      >
        {item.kind === "dir" ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{basename(item.path)}</div>
          <div className="truncate text-[10.5px] text-muted-foreground">
            {item.path}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        title="从最近记录中移除"
        className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:block"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  )
}

function EmptyState() {
  const setRoot = useWorkspaceStore((s) => s.setRoot)
  const setWatchStatus = useWorkspaceStore((s) => s.setWatchStatus)
  const root = useWorkspaceStore((s) => s.root)

  const handlePick = async () => {
    try {
      const res = await DialogService.PickDirectory({
        title: "选择工作区根目录",
        default: root,
      })
      if (!res || res.canceled || !res.path) return
      const info = await WorkspaceService.SetRoot({ root: res.path.trim() })
      if (!info) return
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
    } catch (err) {
      console.error("[recent] pick failed", err)
      setWatchStatus("error", String(err))
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <div className="text-xs text-muted-foreground">暂无最近记录</div>
      <button
        type="button"
        onClick={handlePick}
        className="inline-flex items-center gap-1.5 rounded-sm border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-muted"
      >
        <FolderOpen className="h-3 w-3" />
        打开目录
      </button>
    </div>
  )
}

function basename(p: string): string {
  if (!p) return ""
  const norm = p.replace(/[\\/]+$/, "")
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"))
  return idx >= 0 ? norm.slice(idx + 1) || norm : norm
}