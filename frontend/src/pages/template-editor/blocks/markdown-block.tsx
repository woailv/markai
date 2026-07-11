import { markdown } from "@codemirror/lang-markdown"
import CodeMirror from "@uiw/react-codemirror"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  MoveDown,
  MoveUp,
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
  onMove: (id: string, dir: -1 | 1) => void
  onDuplicate: (id: string) => void
}

export function MarkdownBlock({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  onDuplicate,
}: MarkdownBlockProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [focused, setFocused] = useState(false)
  const summary = blockSummary(block.content) || "空块"
  const chars = block.content.length

  return (
    <div
      className={
        "group relative rounded-lg border bg-background shadow-sm transition-all " +
        (focused
          ? "border-primary/50 ring-2 ring-primary/10"
          : "hover:border-border/80")
      }
    >
      {/* 左侧序号色条 */}
      <div
        className={
          "absolute left-0 top-0 h-full w-1 rounded-l-lg transition-colors " +
          (focused ? "bg-primary" : "bg-transparent")
        }
      />

      <div className="flex items-center gap-2 border-b px-3 py-1.5">
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

        <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
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

        <span className="hidden text-[10px] tabular-nums text-muted-foreground/70 sm:inline">
          {chars} 字
        </span>

        <div className="flex items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100">
          <IconBtn
            label="上移"
            disabled={index === 0}
            onClick={() => onMove(block.id, -1)}
          >
            <MoveUp className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            label="下移"
            disabled={index === total - 1}
            onClick={() => onMove(block.id, 1)}
          >
            <MoveDown className="h-3.5 w-3.5" />
          </IconBtn>
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
          <span
            className="ml-1 cursor-grab text-muted-foreground/60 active:cursor-grabbing"
            title="拖动排序(待实现)"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
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
            placeholder="输入 Markdown 内容,{{variable}} 与文件路径会自动高亮"
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