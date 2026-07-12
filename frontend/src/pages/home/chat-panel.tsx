import { Bot, Sparkles, User } from "lucide-react"
import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

import { ChatToolbar } from "./chat-toolbar"
import { RichComposer } from "./composer/rich-composer"
import { MessageContent } from "./message-content"
import { formatRelativeTime } from "./types"
import type { ChatMessage, Template } from "./types"

interface ChatPanelProps {
  messages: ChatMessage[]
  onSend: (content: string) => void
  onClear: () => void
  onOpenHistory?: () => void
  templates: Template[]
  selectedTemplateIds: Set<number>
  onToggleTemplate: (id: number) => void
  onCreateTemplate: () => void
  onEditTemplate: (id: number) => void
  onDeleteTemplate: (id: number) => void
}

export function ChatPanel({
  messages,
  onSend,
  onClear,
  onOpenHistory,
  templates,
  selectedTemplateIds,
  onToggleTemplate,
  onCreateTemplate,
  onEditTemplate,
  onDeleteTemplate,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const selectedCount = selectedTemplateIds.size

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Header - 极简 + 工具条 */}
      <div className="shrink-0 border-b px-4 py-2">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            会话
            {selectedCount > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {selectedCount} 模板
              </span>
            )}
          </h2>
          <ChatToolbar
            messages={messages}
            onClear={onClear}
            onOpenHistory={onOpenHistory}
          />
        </div>
      </div>

      {/* Messages - 全宽居中 */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
      >
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center py-16">
              <div className="max-w-xs text-center text-sm text-muted-foreground">
                开始你的第一次对话
              </div>
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t bg-background/50 px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <RichComposer
            onSend={onSend}
            templates={templates}
            selectedTemplateIds={selectedTemplateIds}
            onToggleTemplate={onToggleTemplate}
            onCreateTemplate={onCreateTemplate}
            onEditTemplate={onEditTemplate}
            onDeleteTemplate={onDeleteTemplate}
          />
        </div>
      </div>
    </section>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user"
  return (
    <div
      className={cn(
        "group flex gap-2.5",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>
      <div
        className={cn(
          "flex min-w-0 max-w-[75%] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "min-w-0 max-w-full break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm overflow-hidden",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm border bg-background",
          )}
        >
          <MessageContent content={msg.content} inverted={isUser} />
        </div>
        <span className="px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {formatRelativeTime(msg.createdAt)}
        </span>
      </div>
    </div>
  )
}