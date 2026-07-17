import { MessageSquare, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react"
import { useMemo, useState, type ReactElement } from "react"

import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface HistoryPopoverProps {
  conversations: ConversationSummary[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  onRename: (id: number, newTitle: string) => void
  onTogglePin: (id: number, pinned: boolean) => void
  onClearAll: () => void
  children: ReactElement
}

/**
 * 会话历史 Popover。承载列表 + 搜索 + 置顶/重命名/删除。
 * 置顶项独立分组显示,视觉与 shadcn 组件风格一致。
 */
export function HistoryPopover({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onTogglePin,
  onClearAll,
  children,
}: HistoryPopoverProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) =>
      (c.title || "").toLowerCase().includes(q),
    )
  }, [conversations, query])

  const pinned = filtered.filter((c) => c.pinned)
  const others = filtered.filter((c) => !c.pinned)

  const handleRename = (c: ConversationSummary) => {
    const newTitle = window.prompt("输入新标题", c.title)
    if (newTitle && newTitle.trim() && newTitle.trim() !== c.title) {
      onRename(c.id, newTitle.trim())
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side="bottom"
        align="end"
        className="flex w-[380px] flex-col overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索会话..."
              className="h-7 w-full rounded-md border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(false)
              onNew()
            }}
            className="h-7 gap-1 px-2 text-xs"
            title="新建会话"
          >
            <Plus className="h-3.5 w-3.5" />
            新建
          </Button>
        </div>

        <div className="max-h-[420px] min-h-0 flex-1 overflow-y-auto p-1.5">
          {conversations.length === 0 ? (
            <EmptyState
              onNew={() => {
                setOpen(false)
                onNew()
              }}
            />
          ) : filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              没有找到匹配的会话
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <SectionLabel>置顶</SectionLabel>
                  {pinned.map((c) => (
                    <HistoryRow
                      key={c.id}
                      conv={c}
                      active={c.id === activeId}
                      onSelect={() => {
                        onSelect(c.id)
                        setOpen(false)
                      }}
                      onRename={() => handleRename(c)}
                      onDelete={() => onDelete(c.id)}
                      onTogglePin={() => onTogglePin(c.id, !c.pinned)}
                    />
                  ))}
                </>
              )}
              {others.length > 0 && (
                <>
                  {pinned.length > 0 && <SectionLabel>其他</SectionLabel>}
                  {others.map((c) => (
                    <HistoryRow
                      key={c.id}
                      conv={c}
                      active={c.id === activeId}
                      onSelect={() => {
                        onSelect(c.id)
                        setOpen(false)
                      }}
                      onRename={() => handleRename(c)}
                      onDelete={() => onDelete(c.id)}
                      onTogglePin={() => onTogglePin(c.id, !c.pinned)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {conversations.length > 0 && (
          <div className="flex items-center justify-between border-t px-2.5 py-1.5">
            <span className="text-[10px] text-muted-foreground">
              共 {conversations.length} 条
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false)
                onClearAll()
              }}
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              清空全部
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

function HistoryRow({
  conv,
  active,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
}: {
  conv: ConversationSummary
  active: boolean
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate" title={conv.title}>
        {conv.title || "新会话"}
      </span>
      {conv.pinned && (
        <Pin className="h-3 w-3 shrink-0 text-primary/70 group-hover:opacity-0" />
      )}
      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded bg-background/95 pl-1 group-hover:flex">
        <RowAction
          title={conv.pinned ? "取消置顶" : "置顶"}
          onClick={onTogglePin}
        >
          {conv.pinned ? (
            <PinOff className="h-3 w-3" />
          ) : (
            <Pin className="h-3 w-3" />
          )}
        </RowAction>
        <RowAction title="重命名" onClick={onRename}>
          <Pencil className="h-3 w-3" />
        </RowAction>
        <RowAction title="删除" onClick={onDelete} destructive>
          <Trash2 className="h-3 w-3" />
        </RowAction>
      </div>
    </div>
  )
}

function RowAction({
  title,
  onClick,
  destructive,
  children,
}: {
  title: string
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground",
        destructive
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground">还没有会话</p>
      <Button
        size="sm"
        variant="outline"
        onClick={onNew}
        className="h-7 gap-1 text-xs"
      >
        <Plus className="h-3 w-3" />
        新建会话
      </Button>
    </div>
  )
}