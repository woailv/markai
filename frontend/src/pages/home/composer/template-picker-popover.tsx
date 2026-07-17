import {
  FileText,
  Plus,
  Search,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react"
import { useMemo, useState, type ReactElement } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { buildTemplatePreview } from "../utils"
import type { Template } from "../types"

interface TemplatePickerPopoverProps {
  templates: Template[]
  selectedIds: Set<number>
  onToggle: (id: number) => void
  onCreate: () => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  /** 必须是一个原生 <button> 元素,Popover 会将触发行为合并到它上面 */
  children: ReactElement
}

export function TemplatePickerPopover({
  templates,
  selectedIds,
  onToggle,
  onCreate,
  onEdit,
  onDelete,
  children,
}: TemplatePickerPopoverProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const pendingDeleteTpl = useMemo(
    () => templates.find((t) => t.id === pendingDeleteId) ?? null,
    [templates, pendingDeleteId],
  )

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
        side="top"
        align="start"
        className="flex w-[360px] flex-col overflow-hidden"
      >
        {/* Header: search + create */}
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
              onCreate()
            }}
            className="h-7 gap-1 px-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            新建
          </Button>
        </div>

        {/* List */}
        <div className="max-h-[340px] min-h-0 flex-1 overflow-y-auto p-1">
          {templates.length === 0 ? (
            <EmptyState
              onCreate={() => {
                setOpen(false)
                onCreate()
              }}
            />
          ) : filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              没有找到匹配的模板
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map(({ tpl, preview }) => {
                const checked = selectedIds.has(tpl.id)
                return (
                  <li key={tpl.id}>
                    <div
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-muted/60",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(tpl.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-primary"
                        aria-label={`选择 ${tpl.title}`}
                      />
                      <button
                        type="button"
                        onClick={() => onToggle(tpl.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <FileText
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            checked
                              ? "text-primary"
                              : "text-muted-foreground/70",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {tpl.title || "未命名"}
                        </span>
                      </button>
                      {/* 右侧尾部:默认显示字数,hover 时切换为操作按钮组(占位一致,避免抖动) */}
                      <div className="relative flex shrink-0 items-center">
                        <span
                          className={cn(
                            "text-[10px] text-muted-foreground transition-opacity",
                            "group-hover:opacity-0",
                          )}
                        >
                          {preview.chars}字
                        </span>
                        <div
                          className={cn(
                            "absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5",
                            "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
                          )}
                        >
                          <button
                            type="button"
                            // 用 onMouseDown 触发,避免 Popover 在 click 前因焦点/blur 而关闭
                            // 导致按钮卸载、click 事件丢失(打开按钮点击无响应的根因)。
                            onMouseDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              onEdit(tpl.id)
                              setOpen(false)
                            }}
                            title="在标签页打开编辑"
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded text-muted-foreground",
                              "hover:bg-muted hover:text-foreground",
                            )}
                          >
                            <SquareArrowOutUpRight className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setPendingDeleteId(tpl.id)
                            }}
                            title="删除模板"
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded text-muted-foreground",
                              "hover:bg-destructive/10 hover:text-destructive",
                            )}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模板</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除模板「{pendingDeleteTpl?.title || "未命名"}」吗?此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId !== null) onDelete(pendingDeleteId)
                setPendingDeleteId(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground">还没有模板</p>
      <Button size="sm" variant="outline" onClick={onCreate} className="h-7 gap-1 text-xs">
        <Plus className="h-3 w-3" />
        创建第一个
      </Button>
    </div>
  )
}