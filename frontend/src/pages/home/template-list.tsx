import { FileText, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatRelativeTime } from "./types"
import type { Template } from "./types"
import { buildTemplatePreview } from "./utils"

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
  const [query, setQuery] = useState("")

  const enriched = useMemo(
    () =>
      templates.map((tpl) => ({
        tpl,
        preview: buildTemplatePreview(tpl),
      })),
    [templates],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(
      ({ tpl, preview }) =>
        tpl.title.toLowerCase().includes(q) ||
        preview.summary.toLowerCase().includes(q),
    )
  }, [enriched, query])

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-hidden border-r bg-muted/20">
      {/* Header */}
      <div className="shrink-0 space-y-3 border-b bg-background/50 px-3 pb-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">模板库</h2>
            <p className="text-[11px] text-muted-foreground">
              共 {templates.length} 个模板
            </p>
          </div>
          <Button size="sm" onClick={onCreate} className="h-8 shrink-0 gap-1">
            <Plus className="h-3.5 w-3.5" />
            新建
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索模板..."
            className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-input focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
        {templates.length === 0 ? (
          <EmptyState onCreate={onCreate} />
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            没有找到匹配的模板
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map(({ tpl, preview }) => {
              const isActive = tpl.id === selectedId
              return (
                <li key={tpl.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(tpl.id)}
                    className={cn(
                      "group flex w-full flex-col items-start gap-1 overflow-hidden rounded-md border border-transparent px-2.5 py-2 text-left transition-all",
                      isActive
                        ? "border-border bg-background shadow-sm"
                        : "hover:border-border/50 hover:bg-background/70",
                    )}
                  >
                    <div className="flex w-full items-center gap-1.5">
                      <FileText
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground/70",
                        )}
                      />
                      <span
                        className={cn(
                          "flex-1 truncate text-sm",
                          isActive ? "font-semibold" : "font-medium",
                        )}
                      >
                        {tpl.title || "未命名"}
                      </span>
                    </div>
                    <span className="line-clamp-2 w-full break-words pl-5 text-[11px] leading-relaxed text-muted-foreground">
                      {preview.summary || "空模板"}
                    </span>
                    <div className="flex w-full items-center gap-1.5 pl-5 text-[10px] text-muted-foreground/80">
                      <span>{preview.blocks.length} 块</span>
                      {preview.variables.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{preview.variables.length} 变量</span>
                        </>
                      )}
                      <span className="ml-auto">
                        {formatRelativeTime(tpl.updatedAt)}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">还没有模板</p>
        <p className="text-xs text-muted-foreground">
          创建你的第一个 Prompt 模板
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onCreate} className="gap-1">
        <Plus className="h-3.5 w-3.5" />
        新建模板
      </Button>
    </div>
  )
}