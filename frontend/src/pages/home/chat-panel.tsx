import { Bot, Sparkles, User } from "lucide-react"
import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

import { RichComposer } from "./composer/rich-composer"
import { formatRelativeTime } from "./types"
import type { ChatMessage, Template } from "./types"

interface ChatPanelProps {
  messages: ChatMessage[]
  onSend: (content: string) => void
  activeTemplate: Template | null
}

export function ChatPanel({
  messages,
  onSend,
  activeTemplate,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col border-r bg-background">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              会话
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {activeTemplate
                ? `使用模板 · ${activeTemplate.title}`
                : "未选择模板"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {messages.length} 条
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xs text-center text-sm text-muted-foreground">
              开始你的第一次对话
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t bg-background/50 p-3">
        <RichComposer onSend={onSend} />
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
            "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm border bg-background",
          )}
        >
          {msg.content}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {formatRelativeTime(msg.createdAt)}
        </span>
      </div>
    </div>
  )
}