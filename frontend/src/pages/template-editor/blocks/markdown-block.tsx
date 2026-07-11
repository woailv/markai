import { markdown } from "@codemirror/lang-markdown"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import CodeMirror from "@uiw/react-codemirror"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  Trash2,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

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
          <CodeMirror
            value={block.content}
            minHeight="140px"
            extensions={[markdown(), ...promptExtensions]}
            onChange={(v) => onChange(block.id, v)}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
            }}
            placeholder="请输入内容..."
          />
        </div>
      )}
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