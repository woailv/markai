import { markdown } from "@codemirror/lang-markdown"
import CodeMirror from "@uiw/react-codemirror"
import { GripVertical, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import { promptExtensions } from "./cm-extensions"
import type { TemplateBlock } from "./types"

interface MarkdownBlockProps {
  block: TemplateBlock
  index: number
  total: number
  onChange: (id: string, content: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
}

export function MarkdownBlock({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: MarkdownBlockProps) {
  return (
    <div className="group rounded-lg border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5" />
          <span>Markdown 块 #{index + 1}</span>
        </div>
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
          <Button
            size="sm"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMove(block.id, -1)}
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={index === total - 1}
            onClick={() => onMove(block.id, 1)}
          >
            ↓
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(block.id)}
            disabled={total === 1}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="p-2">
        <CodeMirror
          value={block.content}
          minHeight="120px"
          extensions={[markdown(), ...promptExtensions]}
          onChange={(v) => onChange(block.id, v)}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
          }}
          placeholder="输入 Markdown 内容,支持 {{variable}} 与文件路径高亮"
        />
      </div>
    </div>
  )
}