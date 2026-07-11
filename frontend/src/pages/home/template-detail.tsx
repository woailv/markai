import { Clock, FileText, Pencil, Trash2, Variable } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { blockSummary } from "@/pages/template-editor/blocks/variable-utils"

import { formatRelativeTime } from "./types"
import type { Template } from "./types"
import { buildTemplatePreview } from "./utils"

interface TemplateDetailProps {
  template: Template | null
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}

export function TemplateDetail({
  template,
  onEdit,
  onDelete,
}: TemplateDetailProps) {
  const preview = useMemo(
    () => (template ? buildTemplatePreview(template) : null),
    [template],
  )

  if (!template || !preview) {
    return (
      <aside className="flex h-full w-96 shrink-0 flex-col items-center justify-center gap-3 border-l bg-muted/10 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">未选择模板</p>
          <p className="text-xs text-muted-foreground">
            从左侧列表选择一个模板查看详情
          </p>
        </div>
      </aside>
    )
  }

  const handleDelete = () => {
    if (window.confirm(`确定删除模板「${template.title}」?此操作不可恢复。`)) {
      onDelete(template.id)
    }
  }

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col overflow-hidden border-l bg-muted/10">
      {/* Header */}
      <div className="shrink-0 border-b bg-background/50 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">模板详情</h2>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(template.id)}
              className="h-7 gap-1 px-2"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-xs">编辑</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              title="删除模板"
              className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Title */}
        <div className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            标题
          </div>
          <div className="break-words text-base font-semibold leading-snug">
            {template.title || "未命名"}
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {preview.blocks.length} 块
          </span>
          <span>·</span>
          <span>{preview.chars} 字符</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(template.updatedAt)}
          </span>
        </div>

        {/* Variables */}
        {preview.variables.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Variable className="h-3 w-3" />
              变量 ({preview.variables.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {preview.variables.map((v) => (
                <span
                  key={v}
                  className="rounded-md bg-blue-500/10 px-1.5 py-0.5 font-mono text-[11px] text-blue-700 ring-1 ring-blue-500/20 dark:text-blue-300"
                >
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Blocks preview */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            结构预览
          </div>
          <ol className="space-y-1.5">
            {preview.blocks.map((b, i) => {
              const summary = blockSummary(b.content) || "空块"
              const isEmpty = !b.content.trim()
              return (
                <li
                  key={b.id}
                  className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-1.5"
                >
                  <span className="mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
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
        </div>
      </div>
    </aside>
  )
}