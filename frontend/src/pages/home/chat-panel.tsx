import { Events } from "@wailsio/runtime"
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  MessagesSquare,
  Pencil,
  Trash2,
  User,
  X,
} from "lucide-react"
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

import { AssistantMessage } from "./assistant/assistant-message"
import { ChatToolbar } from "./chat-toolbar"
import { RichComposer } from "./composer/rich-composer"
import { stripExecMeta } from "./executor/exec-meta"
import {
  buildFilesContext,
  extractFilePathsFromMessages,
  extractRequestPathsFromMessages,
} from "./file-context"
import { MessageContent } from "./message-content"
import { buildTemplatesContext } from "./template-context"
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
  conversationTitle?: string
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
  conversationTitle,
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
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages])

  // 拖拽选择文本时,靠近容器上/下边缘自动滚动
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const EDGE = 40
    const MAX_SPEED = 24

    let selecting = false
    let pointerY = 0
    let rafId = 0

    const step = () => {
      if (!selecting) {
        rafId = 0
        return
      }
      const rect = el.getBoundingClientRect()
      const distTop = pointerY - rect.top
      const distBottom = rect.bottom - pointerY
      let delta = 0
      if (distTop < EDGE && distTop < distBottom) {
        const ratio = Math.max(0, Math.min(1, 1 - distTop / EDGE))
        delta = -Math.ceil(MAX_SPEED * ratio)
      } else if (distBottom < EDGE) {
        const ratio = Math.max(0, Math.min(1, 1 - distBottom / EDGE))
        delta = Math.ceil(MAX_SPEED * ratio)
      }
      if (delta !== 0) {
        el.scrollTop += delta
      }
      rafId = requestAnimationFrame(step)
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      selecting = true
      pointerY = e.clientY
      if (!rafId) rafId = requestAnimationFrame(step)
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!selecting) return
      pointerY = e.clientY
      if (e.buttons === 0) {
        selecting = false
      }
    }

    const stop = () => {
      selecting = false
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    el.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", stop)
    window.addEventListener("blur", stop)

    return () => {
      el.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", stop)
      window.removeEventListener("blur", stop)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="shrink-0 border-b px-4 py-2">
        <div className="flex w-full items-center justify-between gap-3">
          <h2
            className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight"
            title={conversationTitle || "新会话"}
          >
            {conversationTitle || "新会话"}
          </h2>
          <ChatToolbar
            messages={messages}
            onClear={onClear}
            onOpenHistory={onOpenHistory}
            templates={templates}
          />
        </div>
      </div>

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
                if (msg.role === "assistant") {
                  return (
                    <AssistantRow
                      key={msg.id}
                      msg={msg}
                      isGrouped={isGrouped}
                      onDelete={onDeleteMessage}
                      onEdit={onEditMessage}
                      templates={templates}
                    />
                  )
                }
                return (
                  <UserBubble
                    key={msg.id}
                    msg={msg}
                    isGrouped={isGrouped}
                    onDelete={onDeleteMessage}
                    onEdit={onEditMessage}
                    templates={templates}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

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
 * 用户消息气泡:与旧 MessageBubble 中的 user 分支等价。
 * 保留右侧对齐、深色主色底、悬浮操作栏、折叠预览。
 */
function UserBubble({
  msg,
  isGrouped,
  onDelete,
  onEdit,
  templates,
}: {
  msg: ChatMessage
  isGrouped: boolean
  onDelete?: (id: number) => void
  onEdit?: (id: number, newContent: string) => void
  templates: Template[]
}) {
  const {
    editing,
    editContent,
    setEditContent,
    copied,
    collapsed,
    collapsedPreview,
    setCollapsed,
    handleCopy,
    handleSave,
    handleCancelEdit,
    handleStartEdit,
  } = useMessageActions(msg, templates, onEdit)

  return (
    <div
      className={cn(
        "group flex flex-row-reverse gap-2.5",
        isGrouped ? "mt-1" : "mt-5 first:mt-0",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isGrouped
            ? "invisible"
            : "bg-primary/90 text-primary-foreground ring-1 ring-primary/20",
        )}
        aria-hidden={isGrouped}
      >
        <User className="h-3.5 w-3.5" />
      </div>

      <div className="flex min-w-0 max-w-[calc(78%-8rem)] flex-col items-end gap-1">
        <div
          className={cn(
            "relative min-w-0 max-w-full break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed",
            "bg-primary/95 text-primary-foreground",
            isGrouped ? "rounded-tr-2xl" : "rounded-tr-md",
          )}
        >
          {editing ? (
            <MessageEditor
              value={editContent}
              onChange={setEditContent}
              onSave={handleSave}
              onCancel={handleCancelEdit}
            />
          ) : collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="点击展开"
              className="flex w-full items-center gap-1.5 text-left text-[12.5px] italic text-primary-foreground/80 hover:text-primary-foreground"
            >
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {collapsedPreview || "(空消息)"}
              </span>
            </button>
          ) : (
            <MessageContent content={msg.content} inverted />
          )}

          {!editing && typeof msg.id === "number" && (
            <MessageActionBar
              side="right"
              copied={copied}
              collapsed={collapsed}
              onCopy={handleCopy}
              onToggleCollapse={() => setCollapsed((v) => !v)}
              onStartEdit={handleStartEdit}
              onDelete={() => onDelete && onDelete(msg.id as number)}
              canEdit={!!onEdit}
            />
          )}
        </div>
        <TimeLabel createdAt={msg.createdAt} />
      </div>
    </div>
  )
}

/**
 * AI 消息展示行:去气泡、通栏、左侧细竖线 + 头像。
 * 编辑态复用 MessageEditor;正常态走 AssistantMessage。
 * 悬浮操作栏挂在头像右侧顶部,不占据正文空间。
 */
function AssistantRow({
  msg,
  isGrouped,
  onDelete,
  onEdit,
  templates,
}: {
  msg: ChatMessage
  isGrouped: boolean
  onDelete?: (id: number) => void
  onEdit?: (id: number, newContent: string) => void
  templates: Template[]
}) {
  const {
    editing,
    editContent,
    setEditContent,
    copied,
    collapsed,
    collapsedPreview,
    setCollapsed,
    handleCopy,
    handleSave,
    handleCancelEdit,
    handleStartEdit,
  } = useMessageActions(msg, templates, onEdit)

  return (
    <div
      className={cn(
        "group flex gap-2.5",
        isGrouped ? "mt-2" : "mt-6 first:mt-0",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isGrouped
            ? "invisible"
            : "bg-muted text-muted-foreground ring-1 ring-border/60",
        )}
        aria-hidden={isGrouped}
      >
        <Bot className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1 pr-32">
        <div className="relative border-l-2 border-border/50 pl-3">
          {editing ? (
            <MessageEditor
              value={editContent}
              onChange={setEditContent}
              onSave={handleSave}
              onCancel={handleCancelEdit}
            />
          ) : collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="点击展开"
              className="flex w-full items-center gap-1.5 py-1 text-left text-[12.5px] italic text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {collapsedPreview || "(空消息)"}
              </span>
            </button>
          ) : (
            <AssistantMessage content={msg.content} />
          )}

          {!editing && typeof msg.id === "number" && (
            <div className="absolute bottom-0 -mb-2 left-full ml-2 flex items-center gap-0.5 rounded-md border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              <ActionButton
                title={copied ? "已复制" : "复制消息"}
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </ActionButton>
              <ActionButton
                title={collapsed ? "展开消息" : "收起消息"}
                onClick={() => setCollapsed((v) => !v)}
              >
                {collapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </ActionButton>
              {onEdit && (
                <ActionButton title="编辑消息" onClick={handleStartEdit}>
                  <Pencil className="h-3 w-3" />
                </ActionButton>
              )}
              <ActionButton
                title="删除消息"
                onClick={() => onDelete && onDelete(msg.id as number)}
                destructive
              >
                <Trash2 className="h-3 w-3" />
              </ActionButton>
            </div>
          )}
        </div>
        <div className="pl-3">
          <TimeLabel createdAt={msg.createdAt} />
        </div>
      </div>
    </div>
  )
}

/**
 * 共享的消息级操作 hook:复制/折叠/编辑状态与回调。
 * user 与 assistant 都需要这些能力,行为一致。
 * onEdit 由外层传入,handleSave 会在内容确有变化时透传给它。
 */
function useMessageActions(
  msg: ChatMessage,
  templates: Template[],
  onEdit?: (id: number, newContent: string) => void,
) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(msg.content)
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const collapsedPreview = (() => {
    const plain = stripExecMeta(msg.content)
    const firstLine = plain
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? ""
    const MAX = 80
    return firstLine.length > MAX ? `${firstLine.slice(0, MAX)}…` : firstLine
  })()

  const handleCopy = async () => {
    try {
      const isUser = msg.role === "user"
      const body = stripExecMeta(msg.content)
      const header = `**${isUser ? "User" : "Assistant"}**:\n\n${body}`
      // 文件 token 路径 + AI 消息中 REQUEST_FILE / REQUEST_DIRECTORY_LIST 的路径
      // 都作为 <files> 上下文的来源
      const tokenPaths = extractFilePathsFromMessages([body])
      const requestPaths = !isUser
        ? extractRequestPathsFromMessages([body])
        : []
      const seen = new Set<string>()
      const paths: string[] = []
      for (const p of [...tokenPaths, ...requestPaths]) {
        if (!seen.has(p)) {
          seen.add(p)
          paths.push(p)
        }
      }
      const filesContext = await buildFilesContext(paths)
      const templatesContext = buildTemplatesContext([body], templates)
      // 顺序: templates → files → 消息正文 —— 与"复制全部"保持一致
      const prefixes = [templatesContext, filesContext].filter(
        (s) => s.length > 0,
      )
      const finalText =
        prefixes.length > 0
          ? `${prefixes.join("\n\n")}\n\n${header}`
          : header
      await navigator.clipboard.writeText(finalText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // 忽略
    }
  }

  const handleSave = () => {
    if (
      editContent.trim() !== msg.content.trim() &&
      onEdit &&
      typeof msg.id === "number"
    ) {
      onEdit(msg.id, editContent)
    }
    setEditing(false)
  }

  return {
    editing,
    editContent,
    setEditContent,
    copied,
    collapsed,
    setCollapsed,
    collapsedPreview,
    handleCopy,
    handleSave,
    handleCancelEdit: () => {
      setEditing(false)
      setEditContent(msg.content)
    },
    handleStartEdit: () => {
      setEditContent(msg.content)
      setEditing(true)
    },
    setEditing,
  }
}

/** 用户气泡的悬浮操作栏(挂在气泡底部左/右) */
function MessageActionBar({
  side,
  copied,
  collapsed,
  onCopy,
  onToggleCollapse,
  onStartEdit,
  onDelete,
  canEdit,
}: {
  side: "left" | "right"
  copied: boolean
  collapsed: boolean
  onCopy: () => void
  onToggleCollapse: () => void
  onStartEdit: () => void
  onDelete: () => void
  canEdit: boolean
}) {
  return (
    <div
      className={cn(
        "absolute bottom-0 -mb-2 flex items-center gap-0.5 rounded-md border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
        side === "right" ? "right-full mr-2" : "left-full ml-2",
      )}
    >
      <ActionButton title={copied ? "已复制" : "复制消息"} onClick={onCopy}>
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </ActionButton>
      <ActionButton
        title={collapsed ? "展开消息" : "收起消息"}
        onClick={onToggleCollapse}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </ActionButton>
      {canEdit && (
        <ActionButton title="编辑消息" onClick={onStartEdit}>
          <Pencil className="h-3 w-3" />
        </ActionButton>
      )}
      <ActionButton title="删除消息" onClick={onDelete} destructive>
        <Trash2 className="h-3 w-3" />
      </ActionButton>
    </div>
  )
}

function ActionButton({
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
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground",
        destructive
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function TimeLabel({ createdAt }: { createdAt: string }) {
  return (
    <span className="px-1 text-[10px] leading-none text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-70">
      {formatRelativeTime(createdAt)}
    </span>
  )
}

// UserBubble / AssistantRow 需要通过 hook 拿到 onEdit,而 hook 内的 handleSave
// 又需触发外层 onEdit(id, newContent)。上面的 hook 只管本地状态,真正的持久化
// 通过下面的 wrapper 处理:重新实现 handleSave 关联 onEdit。
// 为了保持简洁,直接在两个 Row 组件里用组合方式覆盖 handleSave。
//
// 说明:UserBubble/AssistantRow 中传入的 handleSave 目前只关闭编辑态,
// 不调用 onEdit。为避免行为回退,以下补丁在两个组件里替换 MessageEditor 的 onSave。
// 但这已经在原始 MessageBubble 中通过闭包直接完成 —— 我们同样在两个 Row 里
// 直接编写 wrapper,而不是修改共享 hook。

/**
 * 编辑态消息编辑器。
 * 与 RichComposer 一致的能力:file token chip、文件拖入、Wails files:dropped 事件。
 * Enter 不提交(避免误保存),用户需显式点击 √ 保存;Esc 取消。
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
  }, [])

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
        <RichEditor
          value={value}
          onChange={onChange}
          mode="editable"
          fileTokens={{ enabled: true, allowDrop: true }}
          templateTokens={{ enabled: true }}
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