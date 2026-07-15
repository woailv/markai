import { MessageSquare, Plus, Trash2, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"

interface HistorySidebarProps {
  conversations: ConversationSummary[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number, e: React.MouseEvent) => void
  onClearAll?: () => void
  onRename?: (id: number, newTitle: string) => void
}

export function HistorySidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClearAll,
  onRename,
}: HistorySidebarProps) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l bg-muted/20">
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b bg-muted/30 px-2">
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          历史会话
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClearAll}
            disabled={conversations.length === 0 || !onClearAll}
            title="清空全部会话"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNew}
            title="新建会话"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            暂无历史会话
          </div>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "group relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/60",
                activeId === c.id
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate pr-10">
                {c.title || "新会话"}
              </span>
              <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const newTitle = window.prompt("输入新标题", c.title)
                    if (
                      newTitle &&
                      newTitle.trim() &&
                      newTitle.trim() !== c.title
                    ) {
                      onRename?.(c.id, newTitle.trim())
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="重命名"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onDelete(c.id, e)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="删除会话"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}