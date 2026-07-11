import { cn } from "@/lib/utils"

import type { Template } from "./types"

interface TemplateListProps {
  templates: Template[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function TemplateList({
  templates,
  selectedId,
  onSelect,
}: TemplateListProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/20">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">模板</h2>
        <p className="text-xs text-muted-foreground">共 {templates.length} 个</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {templates.map((tpl) => {
          const isActive = tpl.id === selectedId
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "mb-1 flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-background shadow-sm ring-1 ring-border"
                  : "hover:bg-background/60"
              )}
            >
              <span className="font-medium">{tpl.name}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {tpl.description}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}