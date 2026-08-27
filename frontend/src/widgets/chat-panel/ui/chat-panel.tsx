import { Events } from "@wailsio/runtime"
import {
  Bot,
  Check,
  Copy,
  FileDown,
  MessagesSquare,
  Pencil,
  Trash2,
  User,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import {
  RichEditor,
  type RichEditorHandle,
  documentToPlainText,
} from "@/shared/rich-editor"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { FILE_DROP_ROLE } from "@/shared/config"
import { hasDroppableFiles, resolveFileDropTarget } from "@/shared/model"

import { AssistantMessage } from "@/features/assistant"
import { RichComposer } from "@/features/composer"
import {
  buildDirectoryListingsContext,
  buildFilesContext,
  extractFilePathsFromMessages,
  extractRequestPathsByKindFromMessages,
  extractRequestPathsFromMessages,
} from "@/lib/file-context"
import { buildTemplatesContext } from "@/lib/template-context"
import {
  MessageContent,
  formatRelativeTime,
  fragmentsToPlainText,
} from "@/entities/message"
import type { ChatMessage } from "@/entities/message"
import type { Template } from "@/entities/template"

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
  /** 顶栏槽位:调用方注入 PanelHeader 组件,ChatPanel 只负责布局位置 */
  header?: React.ReactNode
}

export function ChatPanel({
  messages,
  onSend,
  onClear,
  onDeleteMessage,
  onEditMessage,
  templates,
  selectedTemplateIds,
  onToggleTemplate,
  onCreateTemplate,
  onEditTemplate,
  onDeleteTemplate,
  header,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  // 会话消息区域作为输入框的"代理落点"的拖拽视觉反馈。
  // 命中后真实插入由 RichComposer 的 files:dropped 处理器完成;这里只负责
  // 高亮提示 + 计数器处理 enter/leave 的经典缺陷。
  const [isAreaDragOver, setIsAreaDragOver] = useState(false)
  const areaDragCounterRef = useRef(0)

  const handleAreaDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDroppableFiles(e.dataTransfer)) return
    areaDragCounterRef.current += 1
    if (!isAreaDragOver) setIsAreaDragOver(true)
  }

  const handleAreaDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (hasDroppableFiles(e.dataTransfer)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      if (!isAreaDragOver) setIsAreaDragOver(true)
    }
  }

  const handleAreaDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDroppableFiles(e.dataTransfer)) return
    areaDragCounterRef.current = Math.max(0, areaDragCounterRef.current - 1)
    if (areaDragCounterRef.current === 0) setIsAreaDragOver(false)
  }

  const handleAreaDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    areaDragCounterRef.current = 0
    setIsAreaDragOver(false)
    if (hasDroppableFiles(e.dataTransfer)) {
      // 阻止默认行为,真实插入交给 Wails files:dropped → RichComposer 代理处理
      e.preventDefault()
    }
  }

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
      {header}
      {/* 包裹层:承载全局遮罩,覆盖会话区 + 输入框区域 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ChatAreaContextMenu
          messages={messages}
          templates={templates}
          onClear={onClear}
        >
          <div
            ref={scrollRef}
            data-file-drop-target="true"
            data-file-drop-role={FILE_DROP_ROLE.messageArea}
            onDragEnter={handleAreaDragEnter}
            onDragOver={handleAreaDragOver}
            onDragLeave={handleAreaDragLeave}
            onDrop={handleAreaDrop}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6"
          >
            <div className="w-full">
              {messages.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="flex flex-col">
                  {messages.map((msg, idx) => {
                    const prev = messages[idx - 1]
                    const next = messages[idx + 1]
                    const isGrouped = prev?.role === msg.role
                    const isGroupedNext = next?.role === msg.role
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
                        isGroupedNext={isGroupedNext}
                        onDelete={onDeleteMessage}
                        onEdit={onEditMessage}
                        templates={templates}
                      />
                    )
                    // (rows derive plain text from msg.fragments internally)
                  })}
                </div>
              )}
            </div>
          </div>
        </ChatAreaContextMenu>

        {/* Zed 风格无边输入区:外层不加水平 padding,让 RichComposer 顶部分隔线
            能与左右两侧的垂直分割线无缝相接;水平留白由 RichComposer 内部承担 */}
        <div className="shrink-0 pt-0 pb-2">
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

        {/* 全局遮罩:覆盖会话区 + 输入框区域 */}
        {isAreaDragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">
              <FileDown className="h-4 w-4 text-primary" />
              释放文件以添加到输入框
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * 会话滚动区域的右键菜单。
 * 承载 "复制全部" 与 "清空会话" 两项操作:
 * - 复制全部:将 templates/files 上下文与对话拼接后写入剪贴板;
 *   若最后一条为 user 消息,追加 assistant 引导后缀。
 * - 清空会话:通过 Popover 二次确认,避免误清空。
 */
function ChatAreaContextMenu({
  messages,
  templates,
  onClear,
  children,
}: {
  messages: ChatMessage[]
  templates: Template[]
  onClear: () => void
  children: React.ReactNode
}) {
  const [copying, setCopying] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const hasMessages = messages.length > 0

  const handleCopyAll = async () => {
    if (!hasMessages || copying) return
    setCopying(true)
    try {
      const plainOf = (m: ChatMessage) => fragmentsToPlainText(m.fragments)
      const conversation = messages
        .map(
          (m) =>
            `**${m.role === "user" ? "User" : "Assistant"}**:\n\n${plainOf(m)}`
        )
        .join("\n\n---\n\n")

      const contents = messages.map(plainOf)
      const paths = extractFilePathsFromMessages(contents)
      const filesContext = await buildFilesContext(paths)
      const templatesContext = buildTemplatesContext(contents, templates)

      const prefixes = [templatesContext, filesContext].filter(
        (s) => s.length > 0
      )
      let finalText =
        prefixes.length > 0
          ? `${prefixes.join("\n\n")}\n\n${conversation}`
          : conversation

      if (messages[messages.length - 1].role === "user") {
        finalText += "\n\n---\n\nPlease provide the assistant's response:"
      }

      await navigator.clipboard.writeText(finalText)
    } catch (err) {
      console.error("复制失败:", err)
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={!hasMessages || copying}
            onClick={handleCopyAll}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>复制全部</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={!hasMessages}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>清空会话</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空会话</AlertDialogTitle>
            <AlertDialogDescription>
              清空后无法恢复,确定继续?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onClear()
                setConfirmOpen(false)
              }}
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function UserBubble({
  msg,
  isGrouped,
  isGroupedNext,
  onDelete,
  onEdit,
  templates,
}: {
  msg: ChatMessage
  isGrouped: boolean
  isGroupedNext: boolean
  onDelete?: (id: number) => void
  onEdit?: (id: number, newContent: string) => void
  templates: Template[]
}) {
  const plainContent = useMemo(
    () => fragmentsToPlainText(msg.fragments),
    [msg.fragments]
  )
  const {
    editing,
    editContent,
    setEditContent,
    copied,
    collapsed,
    lineCount,
    setCollapsed,
    handleCopy,
    handleSave,
    handleCancelEdit,
    handleStartEdit,
  } = useMessageActions(msg, plainContent, templates, onEdit, {
    autoCollapse: true,
  })

  const canEdit = !!onEdit && typeof msg.id === "number"
  const canDelete = !!onDelete && typeof msg.id === "number"
  const isLong = lineCount > 12 || plainContent.length > 800

  // 圆角策略:根据分组位置动态调整右上/右下角
  // 独立单条:! isGrouped && ! isGroupedNext -> 仅右上收紧
  // 分组首条:! isGrouped &&   isGroupedNext -> 右上收紧 + 右下收紧
  // 分组中间:  isGrouped &&   isGroupedNext -> 右上收紧 + 右下收紧
  // 分组末条:  isGrouped && ! isGroupedNext -> 仅右上收紧
  const cornerClass = cn("rounded-tr-md", isGroupedNext && "rounded-br-md")

  return (
    <div
      className={cn(
        "group flex flex-row-reverse gap-2.5",
        isGrouped ? "mt-1" : "mt-5 first:mt-0"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isGrouped
            ? "invisible"
            : cn(
                "bg-primary/10 text-primary ring-1 ring-primary/20",
                "dark:bg-primary/15 dark:text-primary-foreground/90"
              )
        )}
        aria-hidden={isGrouped}
      >
        <User className="h-3.5 w-3.5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
        <div
          className={cn(
            "relative max-w-full min-w-0 rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed break-words",
            // tinted 背景 + 极轻微上到下渐变(顶部略亮,底部略暗,差异 < 5%)
            "bg-primary/10 text-foreground dark:bg-primary/15",
            "bg-gradient-to-b from-primary/[0.13] to-primary/[0.09]",
            "dark:from-primary/[0.18] dark:to-primary/[0.14]",
            "ring-1 ring-primary/20",
            cornerClass
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
            <UserBubbleCollapsed
              content={plainContent}
              lineCount={lineCount}
              onExpand={() => setCollapsed(false)}
            />
          ) : (
            <>
              <MessageContent content={plainContent} />
              {isLong && (
                <div className="mt-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    className={cn(
                      "relative z-10 rounded-full border border-primary/25 bg-background/70 px-2 py-0.5 text-[11px] text-foreground/80",
                      "backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
                    )}
                  >
                    收起
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {/* 消息下方工具栏:与 AI 消息保持一致布局占位,显隐时不引起抖动 */}
        {!editing && (canEdit || canDelete) && (
          <UserMessageToolbar
            copied={copied}
            onCopy={handleCopy}
            onStartEdit={canEdit ? handleStartEdit : undefined}
            onDelete={
              canDelete
                ? () => onDelete && onDelete(msg.id as number)
                : undefined
            }
          />
        )}
        <TimeLabel createdAt={msg.createdAt} />
      </div>
    </div>
  )
}

/**
 * 用户消息下方工具栏。
 *
 * 反抖动策略:始终占位渲染(min-h 保留高度),仅通过 opacity 控制显隐,
 * 与 AI 消息 hover 工具栏行为一致——避免因元素挂载/卸载导致的布局跳动。
 */
function UserMessageToolbar({
  copied,
  onCopy,
  onStartEdit,
  onDelete,
}: {
  copied: boolean
  onCopy: () => void
  onStartEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex min-h-[26px] flex-wrap items-center justify-end gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={onCopy}
        title={copied ? "已复制" : "复制消息"}
        className="flex h-6 w-6 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
      {onStartEdit && (
        <button
          type="button"
          onClick={onStartEdit}
          title="编辑消息"
          className="flex h-6 w-6 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title="删除消息"
          className="flex h-6 w-6 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/**
 * 用户气泡折叠态:
 * 显示原文的前若干行,底部覆盖一层从气泡背景色渐隐到透明的遮罩,
 * 遮罩下方居中显示胶囊按钮以展开全文。
 */
function UserBubbleCollapsed({
  content,
  lineCount,
  onExpand,
}: {
  content: string
  lineCount: number
  onExpand: () => void
}) {
  return (
    <div className="relative">
      {/* 折叠预览:限制最大高度,内容超出部分被遮罩覆盖 */}
      <div className="max-h-[10rem] overflow-hidden">
        <MessageContent content={content} />
      </div>
      {/* 底部渐隐遮罩 —— 使用与气泡一致的 tinted 颜色 */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-10",
          "bg-gradient-to-t from-primary/10 to-transparent",
          "dark:from-primary/15"
        )}
      />
      {/* 展开按钮 */}
      <div className="mt-1 flex justify-center">
        <button
          type="button"
          onClick={onExpand}
          className={cn(
            "relative z-10 rounded-full border border-primary/25 bg-background/70 px-2 py-0.5 text-[11px] text-foreground/80",
            "backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
          )}
        >
          展开全文 · {lineCount} 行
        </button>
      </div>
    </div>
  )
}

function AssistantRow({
  msg,
  isGrouped,
  onDelete,
}: {
  msg: ChatMessage
  isGrouped: boolean
  onDelete?: (id: number) => void
  onEdit?: (id: number, newContent: string) => void
  templates: Template[]
}) {
  const [viewMode, setViewMode] = useState<"all" | "commands">("all")
  const [reading, setReading] = useState(false)
  const [readCopied, setReadCopied] = useState(false)

  const readPathCount = useMemo(
    () => extractRequestPathsFromMessages([msg]).length,
    [msg]
  )

  const hasAnyCommand = useMemo(
    () => (msg.fragments ?? []).some((f) => f.kind !== "TEXT"),
    [msg.fragments]
  )

  const handleReadRequests = async () => {
    if (reading || readPathCount === 0) return
    setReading(true)
    try {
      const { files, dirs } = extractRequestPathsByKindFromMessages([msg])
      const [filesCtx, dirsCtx] = await Promise.all([
        buildFilesContext(files),
        buildDirectoryListingsContext(dirs),
      ])
      const combined = [filesCtx, dirsCtx]
        .filter((s) => s.length > 0)
        .join("\n\n")
      if (combined) {
        await navigator.clipboard.writeText(combined)
        setReadCopied(true)
        window.setTimeout(() => setReadCopied(false), 1200)
      }
    } catch (err) {
      console.error("[chat-panel] read requests failed", err)
    } finally {
      setReading(false)
    }
  }

  return (
    <div
      className={cn(
        "group flex gap-2.5",
        isGrouped ? "mt-2" : "mt-6 first:mt-0"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isGrouped
            ? "invisible"
            : "bg-muted text-muted-foreground ring-1 ring-border/60"
        )}
        aria-hidden={isGrouped}
      >
        <Bot className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="border-l-2 border-border/50 pl-3">
          <AssistantMessage
            messageId={msg.id}
            fragments={msg.fragments}
            viewMode={viewMode}
          />

          {typeof msg.id === "number" && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {hasAnyCommand && (
                <div
                  role="tablist"
                  aria-label="展示模式"
                  className="flex items-center overflow-hidden rounded-md border bg-background text-[10.5px]"
                >
                  <ViewModeTab
                    active={viewMode === "all"}
                    onClick={() => setViewMode("all")}
                    label="全部内容"
                  />
                  <ViewModeTab
                    active={viewMode === "commands"}
                    onClick={() => setViewMode("commands")}
                    label="仅指令"
                  />
                </div>
              )}
              {readPathCount > 0 && (
                <button
                  type="button"
                  onClick={handleReadRequests}
                  disabled={reading}
                  title="读取所有 读文件 / 列目录 指令的实际内容并复制到剪贴板"
                  className={cn(
                    "flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10.5px] text-foreground/80 shadow-sm",
                    "hover:bg-muted hover:text-foreground",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                >
                  {readCopied ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <FileDown className="h-3 w-3" />
                  )}
                  <span>
                    {readCopied
                      ? "已复制"
                      : reading
                        ? "读取中…"
                        : `读取指令 ${readPathCount} 项`}
                  </span>
                </button>
              )}
              <div className="ml-auto flex items-center">
                <button
                  type="button"
                  onClick={() => onDelete && onDelete(msg.id as number)}
                  title="删除消息"
                  className="flex h-6 w-6 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
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

function ViewModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-2 py-1 transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}

function useMessageActions(
  msg: ChatMessage,
  plainContent: string,
  templates: Template[],
  onEdit?: (id: number, newContent: string) => void,
  options?: { autoCollapse?: boolean }
) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(plainContent)
  const [copied, setCopied] = useState(false)

  // 自动折叠阈值
  const AUTO_COLLAPSE_LINES = 12
  const AUTO_COLLAPSE_CHARS = 800

  const lineCount = plainContent.split("\n").length
  const charCount = plainContent.length
  const shouldAutoCollapse =
    !!options?.autoCollapse &&
    (lineCount > AUTO_COLLAPSE_LINES || charCount > AUTO_COLLAPSE_CHARS)

  const [collapsed, setCollapsed] = useState<boolean>(shouldAutoCollapse)
  const userToggledRef = useRef(false)

  // 首次挂载后,若用户从未手动切换过折叠状态,则跟随内容变化重新计算
  // (仅用于消息内容被编辑等场景;一旦用户手动展开/收起,不再自动折叠)
  useEffect(() => {
    if (userToggledRef.current) return
    setCollapsed(shouldAutoCollapse)
  }, [shouldAutoCollapse])

  const setCollapsedByUser = useCallback(
    (v: boolean | ((p: boolean) => boolean)) => {
      userToggledRef.current = true
      setCollapsed(v)
    },
    []
  )

  const collapsedPreview = (() => {
    const firstLine =
      plainContent
        .split("\n")
        .map((s) => s.trim())
        .find((s) => s.length > 0) ?? ""
    const MAX = 80
    return firstLine.length > MAX ? `${firstLine.slice(0, MAX)}…` : firstLine
  })()

  const handleCopy = async () => {
    try {
      const isUser = msg.role === "user"
      const body = plainContent

      let finalText: string
      if (isUser) {
        const header = `**User**:\n\n${body}`
        const tokenPaths = extractFilePathsFromMessages([body])
        const filesContext = await buildFilesContext(tokenPaths)
        const templatesContext = buildTemplatesContext([body], templates)
        const prefixes = [templatesContext, filesContext].filter(
          (s) => s.length > 0
        )
        finalText =
          prefixes.length > 0 ? `${prefixes.join("\n\n")}\n\n${header}` : header
      } else {
        const { files, dirs } = extractRequestPathsByKindFromMessages([msg])
        const [filesCtx, dirsCtx] = await Promise.all([
          buildFilesContext(files),
          buildDirectoryListingsContext(dirs),
        ])
        finalText = [filesCtx, dirsCtx].filter((s) => s.length > 0).join("\n\n")
      }

      await navigator.clipboard.writeText(finalText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }

  const handleSave = () => {
    // editContent 是 RichEditor 的 JSON document 字符串,需要还原为纯文本
    // 再与原文比较、提交,否则 trim() 比对总是失败,且落库的是 JSON 而非用户可读文本。
    const nextPlain = (() => {
      try {
        const v = documentToPlainText(editContent)
        return typeof v === "string" ? v : String(v ?? "")
      } catch {
        return editContent
      }
    })()
    if (
      nextPlain.trim() !== plainContent.trim() &&
      onEdit &&
      typeof msg.id === "number"
    ) {
      onEdit(msg.id, nextPlain)
    }
    setEditing(false)
  }

  return {
    editing,
    editContent,
    setEditContent,
    copied,
    collapsed,
    setCollapsed: setCollapsedByUser,
    collapsedPreview,
    lineCount,
    handleCopy,
    handleSave,
    handleCancelEdit: () => {
      setEditing(false)
      setEditContent(plainContent)
    },
    handleStartEdit: () => {
      setEditContent(plainContent)
      setEditing(true)
    },
    setEditing,
  }
}

function TimeLabel({ createdAt }: { createdAt: string }) {
  return (
    <span className="px-1 text-[10px] leading-none text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-70">
      {formatRelativeTime(createdAt)}
    </span>
  )
}

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
        payload.hasCoords && payload.x !== undefined && payload.y !== undefined

      const allTargets = Array.from(
        document.querySelectorAll<HTMLElement>('[data-file-drop-target="true"]')
      )

      let winner: HTMLElement | null = null

      if (hasCoords) {
        // 有坐标(拖放场景):统一走最具体(嵌套最深)目标判定,确保
        // 消息编辑器优先于包围它的会话消息区域(代理落点)。
        winner = resolveFileDropTarget(payload.x, payload.y)
      } else {
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
      className="flex w-full min-w-0 flex-col gap-2"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={rootRef}
        data-file-drop-target="true"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "w-full min-w-0 rounded border bg-background/80 px-2 py-1 text-foreground transition-colors",
          "focus-within:ring-1 focus-within:ring-ring",
          isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/40",
          "[&.file-drop-target-active]:border-primary [&.file-drop-target-active]:bg-primary/5 [&.file-drop-target-active]:ring-2 [&.file-drop-target-active]:ring-primary/40"
        )}
      >
        <RichEditor
          value={value}
          onChange={onChange}
          mode="editable"
          fileTokens={{ enabled: true, allowDrop: true }}
          templateTokens={{ enabled: true }}
          editorRef={editorRef}
          className="w-full min-w-0"
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
            if (
              typeof plain === "string"
                ? plain.trim()
                : String(plain ?? "").trim()
            ) {
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
