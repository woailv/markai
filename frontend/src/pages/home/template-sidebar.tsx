import { FileCode2, Pencil, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PromptTemplate } from "@/../bindings/prompttool/internal/services/models"

interface TemplateSidebarProps {
  templates: PromptTemplate[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onRename?: (id: number, newTitle: string) => void
  onDelete: (id: number, e: React.MouseEvent) => void
  onClearAll?: () => void
}

/**
 * 模板侧边栏。与 HistorySidebar 视觉/交互一致:
 * - 顶栏标题 + 清空/新建按钮
 * - 列表项 hover 显示重命名/删除
 * - 点击行 = 打开(在主编辑区新增/激活模板 tab)
 */
export function TemplateSidebar({
  templates,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onClearAll,
}: TemplateSidebarProps) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l bg-muted/20">
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b bg-muted/30 px-2">
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          模板
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClearAll}
            disabled={templates.length === 0 || !onClearAll}
            title="清空全部模板"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNew}
            title="新建模板"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {templates.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            暂无模板
          </div>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                "group relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/60",
                activeId === t.id
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate pr-10">
                {t.title || "未命名模板"}
              </span>
              <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const newTitle = window.prompt("输入新标题", t.title)
                    if (
                      newTitle &&
                      newTitle.trim() &&
                      newTitle.trim() !== t.title
                    ) {
                      onRename?.(t.id, newTitle.trim())
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="重命名"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onDelete(t.id, e)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="删除模板"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}