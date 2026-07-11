import type { Template } from "./types"

interface TemplateDetailProps {
  template: Template | null
}

export function TemplateDetail({ template }: TemplateDetailProps) {
  if (!template) {
    return (
      <aside className="flex h-full w-80 shrink-0 items-center justify-center bg-muted/10 text-sm text-muted-foreground">
        请选择一个模板
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col bg-muted/10">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">模板详情</h2>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">名称</div>
          <div className="font-medium">{template.name}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">描述</div>
          <div>{template.description}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">标签</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
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