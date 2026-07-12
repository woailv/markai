import { Bot, MessagesSquare, Sparkles, User } from "lucide-react"
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
  const stickToBottomRef = useRef(true)

  // 用户手动上滚时,暂停自动跟随;回到底部区间(阈值 32px)时恢复
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = distance < 32
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  // 消息更新时,仅当"贴底"时才平滑滚动,避免流式输出中打断用户回读
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottomRef.current) return
    // 用 rAF 确保 DOM 尺寸已更新
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    })
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
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-6"
      >
        <div className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col">
              {messages.map((msg, idx) => {
                const prev = messages[idx - 1]
                const isGrouped = prev?.role === msg.role
                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isGrouped={isGrouped}
                  />
                )
              })}
            </div>
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

/**
 * 单条消息气泡。
 * - isGrouped: 与上一条同角色时,收敛头像 + 缩紧上边距,减少视觉噪声
 * - 用户气泡使用略降饱和的主色 + 无阴影,避免抢夺阅读焦点
 * - AI 气泡使用细描边 + 微弱底色,与背景形成柔和层级
 */
function MessageBubble({
  msg,
  isGrouped,
}: {
  msg: ChatMessage
  isGrouped: boolean
}) {
  const isUser = msg.role === "user"
  return (
    <div
      className={cn(
        "group flex gap-2.5",
        isUser ? "flex-row-reverse" : "flex-row",
        // 分组消息更紧凑;不同角色之间保留清晰间距
        isGrouped ? "mt-1" : "mt-5 first:mt-0",
      )}
    >
      {/* 头像:分组时用占位空白维持对齐,减少重复图标 */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isGrouped
            ? "invisible"
            : isUser
              ? "bg-primary/90 text-primary-foreground ring-1 ring-primary/20"
              : "bg-muted text-muted-foreground ring-1 ring-border/60",
        )}
        aria-hidden={isGrouped}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      <div
        className={cn(
          "flex min-w-0 max-w-[78%] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "min-w-0 max-w-full overflow-hidden break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed",
            isUser
              ? // 主色气泡:降低视觉重量——去阴影 + 顶角收敛,让 AI 内容成为焦点
                cn(
                  "bg-primary/95 text-primary-foreground",
                  isGrouped ? "rounded-tr-2xl" : "rounded-tr-md",
                )
              : // AI 气泡:细描边 + 极浅底色
                cn(
                  "border border-border/70 bg-muted/30 text-foreground",
                  isGrouped ? "rounded-tl-2xl" : "rounded-tl-md",
                ),
          )}
        >
          <MessageContent content={msg.content} inverted={isUser} />
        </div>
        <span
          className={cn(
            "px-1 text-[10px] leading-none text-muted-foreground",
            "opacity-0 transition-opacity duration-150 group-hover:opacity-70",
          )}
        >
          {formatRelativeTime(msg.createdAt)}
        </span>
      </div>
    </div>
  )
}

/** 精致的空状态:图标 + 主副标题,呼吸感与留白 */
function EmptyState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/60">
        <MessagesSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          开始你的第一次对话
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          直接输入消息,或拖入文件、启用模板来提供更多上下文
        </p>
      </div>
    </div>
  )
}