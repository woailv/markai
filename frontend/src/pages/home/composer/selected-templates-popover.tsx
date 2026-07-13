import { ChevronDown, ChevronRight, Pencil, X } from "lucide-react"
import { useMemo, useState, type ReactElement } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { blockSummary } from "@/pages/template-editor/blocks/variable-utils"

import { buildTemplatePreview } from "../utils"
import type { Template } from "../types"

interface SelectedTemplatesPopoverProps {
  templates: Template[]
  onRemove: (id: number) => void
  onEdit: (id: number) => void
  /** 必须是一个原生 <button> 元素,Popover 会将触发行为合并到它上面 */
  children: ReactElement
}

export function SelectedTemplatesPopover({
  templates,
  onRemove,
  onEdit,
  children,
}: SelectedTemplatesPopoverProps) {
  const [open, setOpen] = useState(false)

  const enriched = useMemo(
    () =>
      templates.map((tpl) => ({
        tpl,
        preview: buildTemplatePreview(tpl),
      })),
    [templates],
  )

  const totalChars = useMemo(
    () => enriched.reduce((sum, { preview }) => sum + preview.chars, 0),
    [enriched],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side="top"
        align="start"
        className="flex w-[420px] flex-col overflow-hidden"
      >
        <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          将随消息一起发送 · 共约 {totalChars} 字符
        </div>
        <div className="max-h-[420px] min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {enriched.map(({ tpl, preview }) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              preview={preview}
              onRemove={() => onRemove(tpl.id)}
              onEdit={() => {
                setOpen(false)
                onEdit(tpl.id)
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TemplateCard({
  tpl,
  preview,
  onRemove,
  onEdit,
}: {
  tpl: Template
  preview: ReturnType<typeof buildTemplatePreview>
  onRemove: () => void
  onEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="group rounded-md border bg-background">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "折叠" : "展开"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {tpl.title || "未命名"}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {preview.blocks.length}块 · {preview.chars}字
        </span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            title="编辑"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="移除"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {expanded && (
        <ol className="space-y-1 border-t bg-muted/20 px-2 py-1.5">
          {preview.blocks.map((b, i) => {
            const summary = blockSummary(b.content) || "空块"
            const isEmpty = !b.content.trim()
            return (
              <li key={b.id} className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[11px]",
                    isEmpty
                      ? "italic text-muted-foreground/60"
                      : "text-foreground/85",
                  )}
                  title={summary}
                >
                  {summary}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}