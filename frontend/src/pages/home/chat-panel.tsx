import { Bot, Check, MessagesSquare, Pencil, Sparkles, Trash2, User, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
  onDeleteMessage?: (id: number) => void
  onEditMessage?: (id: number, newContent: string) => void
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
  onDeleteMessage,
  onEditMessage,
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
        <div className="flex w-full items-center justify-between gap-3">
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
        <div className="w-full">
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
                    onDelete={onDeleteMessage}
                    onEdit={onEditMessage}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t bg-background/50 px-4 py-3">
        <div className="w-full">
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
  onDelete,
  onEdit,
}: {
  msg: ChatMessage
  isGrouped: boolean
  onDelete?: (id: number) => void
  onEdit?: (id: number, newContent: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(msg.content)
  const isUser = msg.role === "user"

  const handleSave = () => {
    if (editContent.trim() !== msg.content.trim() && onEdit && typeof msg.id === "number") {
      onEdit(msg.id, editContent)
    }
    setEditing(false)
  }

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
            "group/content relative min-w-0 max-w-full break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed",
            isUser
              ? cn(
                  "bg-primary/95 text-primary-foreground",
                  isGrouped ? "rounded-tr-2xl" : "rounded-tr-md",
                )
              : cn(
                  "border border-border/70 bg-muted/30 text-foreground",
                  isGrouped ? "rounded-tl-2xl" : "rounded-tl-md",
                ),
          )}
        >
          {editing ? (
            <div className="flex min-w-[300px] flex-col gap-2">
              <textarea
                className="min-h-[100px] w-full resize-y rounded bg-background/50 p-2 text-foreground outline-none focus:ring-1 focus:ring-ring"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setEditContent(msg.content)
                  }}
                  className="rounded p-1 hover:bg-muted/50"
                >
                  <X className="h-3 w-3 text-current" />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded p-1 hover:bg-muted/50"
                >
                  <Check className="h-3 w-3 text-current" />
                </button>
              </div>
            </div>
          ) : (
            <MessageContent content={msg.content} inverted={isUser} />
          )}

          {/* 悬浮操作区 */}
          {!editing && typeof msg.id === "number" && (
            <div
              className={cn(
                "absolute top-0 -mt-2 flex items-center gap-0.5 rounded-md border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/content:opacity-100",
                isUser ? "right-full mr-2" : "left-full ml-2",
              )}
            >
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="编辑消息"
                className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onDelete && onDelete(msg.id as number)}
                title="删除消息"
                className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
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