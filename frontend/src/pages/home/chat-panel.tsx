import { Events } from "@wailsio/runtime"
import { Bot, Check, Copy, MessagesSquare, Pencil, Sparkles, Trash2, User, X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import {
  RichEditor,
  type RichEditorHandle,
  documentToPlainText,
} from "@/components/rich-editor"
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
      el.scrollTop = el.scrollHeight
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
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === "user"

  const handleCopy = async () => {
    try {
      const plain = documentToPlainText(msg.content)
      const text =
        typeof plain === "string" ? plain : String(plain ?? "")
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // 忽略剪贴板失败(无权限等),避免打断用户
    }
  }

  const handleSave = () => {
    if (editContent.trim() !== msg.content.trim() && onEdit && typeof msg.id === "number") {
      onEdit(msg.id, editContent)
    }
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditContent(msg.content)
  }

  const handleStartEdit = () => {
    setEditContent(msg.content)
    setEditing(true)
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
            <MessageEditor
              value={editContent}
              onChange={setEditContent}
              onSave={handleSave}
              onCancel={handleCancelEdit}
            />
          ) : (
            <MessageContent content={msg.content} inverted={isUser} />
          )}

          {/* 悬浮操作区:与消息底部对齐 */}
          {!editing && typeof msg.id === "number" && (
            <div
              className={cn(
                "absolute bottom-0 -mb-2 flex items-center gap-0.5 rounded-md border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/content:opacity-100",
                isUser ? "right-full mr-2" : "left-full ml-2",
              )}
            >
              <button
                type="button"
                onClick={handleCopy}
                title={copied ? "已复制" : "复制消息"}
                className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
              <button
                type="button"
                onClick={handleStartEdit}
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

/**
 * 编辑态消息编辑器。
 * 与 RichComposer 一致的能力:file token chip、文件拖入、Wails files:dropped 事件。
 * 与输入框的区别:Enter 不提交(避免误保存),用户需显式点击 √ 保存;Esc 取消。
 */
function MessageEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const editorRef = useRef<RichEditorHandle>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    setIsDragOver(false)
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault()
    }
    // 不 stopPropagation,让 Wails 拦截器收到冒泡
  }, [])

  // 仅在编辑态挂载时订阅;RichComposer 也订阅同一事件,
  // Wails 会广播给所有订阅者,由当前聚焦的编辑器处理插入。
  // 为避免消息编辑器与输入框同时插入,这里只在编辑器聚焦时响应。
  useEffect(() => {
    const unsub = Events.On("files:dropped", (evt) => {
      const handle = editorRef.current
      if (!handle) return
      const view = handle.view
      if (!view) return
      const root = rootRef.current
      if (!root) return
      const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
      if (!payload?.paths?.length) return

      // 全局唯一目标选择:与 RichComposer 保持一致的策略。
      // 扫描页面上所有 data-file-drop-target,通过落点/焦点选出 winner,
      // 只有 winner === 本编辑器根节点时才处理。
      const hasCoords =
        payload.hasCoords &&
        payload.x !== undefined &&
        payload.y !== undefined

      const allTargets = Array.from(
        document.querySelectorAll<HTMLElement>('[data-file-drop-target="true"]'),
      )

      let winner: HTMLElement | null = null

      if (hasCoords) {
        const stack = document.elementsFromPoint(payload.x, payload.y)
        for (const el of stack) {
          const t = allTargets.find((tgt) => tgt.contains(el))
          if (t) {
            winner = t
            break
          }
        }
      }

      if (!winner) {
        const focused = document.activeElement
        if (focused instanceof HTMLElement) {
          winner = allTargets.find((t) => t.contains(focused)) ?? null
        }
      }

      if (winner !== root) return

      setIsDragOver(false)
      if (hasCoords) {
        handle.insertFilesAtCoords(payload.paths, payload.x, payload.y)
      } else {
        handle.insertFilesAtCursor(payload.paths)
      }
    })
    return () => {
      unsub()
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      className="flex min-w-[300px] flex-col gap-2"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={rootRef}
        data-file-drop-target="true"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded border bg-background/80 px-2 py-1 text-foreground transition-colors",
          "focus-within:ring-1 focus-within:ring-ring",
          isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/40",
          "[&.file-drop-target-active]:border-primary [&.file-drop-target-active]:bg-primary/5 [&.file-drop-target-active]:ring-2 [&.file-drop-target-active]:ring-primary/40",
        )}
      >
        {/*
          编辑态必须使用 editable 内核才能接受输入。
          用户气泡背景较深,外层容器给了一个中性亮底,保证文字可读性。
        */}
        <RichEditor
          value={value}
          onChange={onChange}
          mode="editable"
          fileTokens={{ enabled: true, allowDrop: true }}
          editorRef={editorRef}
          className="w-full"
        />
      </div>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          title="取消 (Esc)"
          className="rounded p-1 hover:bg-muted/50"
        >
          <X className="h-3 w-3 text-current" />
        </button>
        <button
          type="button"
          onClick={() => {
            const plain = documentToPlainText(value)
            if (typeof plain === "string" ? plain.trim() : String(plain ?? "").trim()) {
              onSave()
            }
          }}
          title="保存"
          className="rounded p-1 hover:bg-muted/50"
        >
          <Check className="h-3 w-3 text-current" />
        </button>
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