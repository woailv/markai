import { Button } from "@/components/ui/button"

import type { Template } from "./types"

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
  if (!template) {
    return (
      <aside className="flex h-full w-80 shrink-0 items-center justify-center bg-muted/10 text-sm text-muted-foreground">
        请选择一个模板
      </aside>
    )
  }

  const handleDelete = () => {
    if (window.confirm(`确定删除模板「${template.title}」?`)) {
      onDelete(template.id)
    }
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col bg-muted/10">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">模板详情</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(template.id)}
          >
            编辑
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDelete}>
            删除
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">标题</div>
          <div className="font-medium">{template.title}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">内容</div>
          <pre className="mt-1 whitespace-pre-wrap rounded-md border bg-background p-3 text-xs">
            {template.content}
          </pre>
        </div>
        <div className="text-xs text-muted-foreground">
          更新于 {template.updatedAt}
        </div>
      </div>
    </aside>
  )
}