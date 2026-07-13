import { MessageSquare, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"

interface HistorySidebarProps {
  conversations: ConversationSummary[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number, e: React.MouseEvent) => void
}

export function HistorySidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: HistorySidebarProps) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/20">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">历史会话</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNew}
          title="新建会话"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            暂无历史会话
          </div>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "group relative flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                activeId === c.id ? "bg-muted font-medium" : "text-muted-foreground",
              )}
            >
              <div className="flex items-center gap-2 truncate">
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{c.title || "新会话"}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] opacity-70">
                <span>{c.messageCount} 条消息</span>
                <span>{new Date(c.updatedAt).toLocaleDateString()}</span>
              </div>
              <div
                className="absolute right-2 top-2 hidden items-center justify-center rounded bg-background/80 p-1 shadow-sm hover:text-destructive group-hover:flex"
                onClick={(e) => onDelete(c.id, e)}
                title="删除会话"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}