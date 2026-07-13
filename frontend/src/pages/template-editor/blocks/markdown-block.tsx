import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Events } from "@wailsio/runtime"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  Trash2,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import { RichEditor, type RichEditorHandle } from "@/components/rich-editor"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { promptExtensions } from "./cm-extensions"
import type { TemplateBlock } from "./types"
import { blockSummary } from "./variable-utils"

interface MarkdownBlockProps {
  block: TemplateBlock
  index: number
  total: number
  onChange: (id: string, content: string) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
}

export function SortableMarkdownBlock(props: MarkdownBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.block.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <MarkdownBlock
        {...props}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

interface InternalProps extends MarkdownBlockProps {
  isDragging?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
}

function MarkdownBlock({
  block,
  index,
  total,
  onChange,
  onRemove,
  onDuplicate,
  isDragging,
  dragHandleProps,
}: InternalProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [focused, setFocused] = useState(false)
  const summary = blockSummary(block.content) || "空块"

  const stateClass = isDragging
    ? "border-primary/60 shadow-lg ring-2 ring-primary/20"
    : focused
      ? "border-primary/50 shadow-md ring-2 ring-primary/10"
      : "border-border/60 hover:border-border hover:shadow-sm"

  return (
    <div
      className={
        "group relative overflow-hidden rounded-xl border bg-background transition-all duration-150 " +
        stateClass
      }
    >
      <div
        className={
          "flex items-center gap-2 border-b px-3 py-1.5 transition-colors " +
          (focused ? "bg-muted/40" : "bg-muted/20")
        }
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label={collapsed ? "展开" : "折叠"}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-background px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-border/60">
          {index + 1}
        </span>

        <span
          className={
            "flex-1 truncate text-xs " +
            (block.content
              ? "text-foreground/80"
              : "italic text-muted-foreground/60")
          }
          title={summary}
        >
          {summary}
        </span>

        <div className="flex items-center gap-0.5 opacity-50 transition-opacity group-hover:opacity-100">
          <IconBtn label="复制块" onClick={() => onDuplicate(block.id)}>
            <Copy className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            label="删除"
            disabled={total === 1}
            onClick={() => onRemove(block.id)}
            danger
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
          <button
            type="button"
            {...dragHandleProps}
            className="ml-0.5 flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground active:cursor-grabbing"
            title="拖动排序"
            aria-label="拖动排序"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div
          className="p-2"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          <MarkdownBlockEditor
            value={block.content}
            onChange={(v) => onChange(block.id, v)}
          />
        </div>
      )}
    </div>
  )
}

/**
 * 模板块的可编辑内核封装。
 * 与 MessageEditor 保持一致:
 *  - 挂载 data-file-drop-target,由 Wails 广播的 files:dropped 事件按落点/焦点决出唯一 winner
 *  - 启用 fileTokens.enabled + allowDrop,让 RichEditor 阻断 CM 默认粘贴并渲染 chip
 *  - 不订阅 onSubmit,Enter 走换行,符合模板编辑语义
 */
function MarkdownBlockEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
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
        document.querySelectorAll<HTMLElement>(
          '[data-file-drop-target="true"]',
        ),
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

  return (
    <div
      ref={rootRef}
      data-file-drop-target="true"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "rounded-md transition-colors",
        isDragOver && "bg-primary/5 ring-2 ring-primary/40",
        "[&.file-drop-target-active]:bg-primary/5 [&.file-drop-target-active]:ring-2 [&.file-drop-target-active]:ring-primary/40",
      )}
    >
      <RichEditor
        value={value}
        onChange={onChange}
        mode="editable"
        markdown
        placeholder="请输入内容..."
        // 启用文件 token 识别与拖放;不订阅 onSubmit,Enter 保持换行
        fileTokens={{ enabled: true, allowDrop: true }}
        editorRef={editorRef}
        extraExtensions={promptExtensions}
        className="min-h-[60px]"
      />
    </div>
  )
}

interface IconBtnProps {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}

function IconBtn({ label, onClick, disabled, danger, children }: IconBtnProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        "h-6 w-6 p-0 " +
        (danger
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted")
      }
    >
      {children}
    </Button>
  )
}