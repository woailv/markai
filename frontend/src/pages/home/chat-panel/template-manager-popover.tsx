import { FileCode2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useMemo, useState, type ReactElement } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import type { Template } from "../types"
import { buildTemplatePreview } from "../utils"

interface TemplateManagerPopoverProps {
  templates: Template[]
  activeTemplateId: number | null
  onEdit: (id: number) => void
  onNew: () => void
  onRename: (id: number, newTitle: string) => void
  onDelete: (id: number) => void
  onClearAll: () => void
  children: ReactElement
}

/**
 * 模板管理 Popover。与 composer 的模板选择器区分:
 * - 选择器(TemplatePickerPopover):批量勾选,直接插入对话
 * - 管理器(本组件):浏览、编辑、重命名、删除模板本身
 */
export function TemplateManagerPopover({
  templates,
  activeTemplateId,
  onEdit,
  onNew,
  onRename,
  onDelete,
  onClearAll,
  children,
}: TemplateManagerPopoverProps) {
  const [open, setOpen] = useState(false)
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side="bottom"
        align="end"
        className="flex w-[380px] flex-col overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索模板..."
              className="h-7 w-full rounded-md border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(false)
              onNew()
            }}
            className="h-7 gap-1 px-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            新建
          </Button>
        </div>

        <div className="max-h-[420px] min-h-0 flex-1 overflow-y-auto p-1.5">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <FileCode2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">还没有模板</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpen(false)
                  onNew()
                }}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="h-3 w-3" />
                创建第一个
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              没有找到匹配的模板
            </div>
          ) : (
            filtered.map(({ tpl, preview }) => (
              <div
                key={tpl.id}
                onClick={() => {
                  onEdit(tpl.id)
                  setOpen(false)
                }}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                  activeTemplateId === tpl.id
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span
                  className="min-w-0 flex-1 truncate"
                  title={tpl.title}
                >
                  {tpl.title || "未命名模板"}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground group-hover:opacity-0">
                  {preview.chars}字
                </span>
                <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded bg-background/95 pl-1 group-hover:flex">
                  <RowAction
                    title="重命名"
                    onClick={() => {
                      const nt = window.prompt("输入新标题", tpl.title)
                      if (nt && nt.trim() && nt.trim() !== tpl.title) {
                        onRename(tpl.id, nt.trim())
                      }
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </RowAction>
                  <RowAction
                    title="删除"
                    destructive
                    onClick={() => onDelete(tpl.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </RowAction>
                </div>
              </div>
            ))
          )}
        </div>

        {templates.length > 0 && (
          <div className="flex items-center justify-between border-t px-2.5 py-1.5">
            <span className="text-[10px] text-muted-foreground">
              共 {templates.length} 个
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false)
                onClearAll()
              }}
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              清空全部
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function RowAction({
  title,
  onClick,
  destructive,
  children,
}: {
  title: string
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground",
        destructive
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}