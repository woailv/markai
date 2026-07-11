import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { Template } from "./types"

interface TemplateListProps {
  templates: Template[]
  selectedId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
}

export function TemplateList({
  templates,
  selectedId,
  onSelect,
  onCreate,
}: TemplateListProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden border-r bg-muted/20">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">模板</h2>
          <p className="text-xs text-muted-foreground">
            共 {templates.length} 个
          </p>
        </div>
        <Button size="sm" onClick={onCreate}>
          新建
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        {templates.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            暂无模板,点击"新建"创建一个
          </div>
        ) : (
          templates.map((tpl) => {
            const isActive = tpl.id === selectedId
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onSelect(tpl.id)}
                className={cn(
                  "mb-1 flex w-full flex-col items-start gap-1 overflow-hidden rounded-md px-3 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-background shadow-sm ring-1 ring-border"
                    : "hover:bg-background/60"
                )}
              >
                <span className="w-full truncate font-medium">{tpl.title}</span>
                <span className="line-clamp-2 w-full break-words text-xs text-muted-foreground">
                  {tpl.content}
                </span>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}