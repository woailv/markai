import { MoreHorizontal, X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import type { Template } from "@/entities/template"

interface SelectedTemplateTagsProps {
  templates: Template[]
  onOpen: (id: number) => void
  onRemove: (id: number) => void
}

/**
 * 已选模板 tag 行:
 *  - 只占据 1 行,水平方向自适应剩余空间
 *  - 若渲染宽度超过容器,自动隐藏尾部若干 tag,以 "更多 (N)" 按钮弹出全部
 *  - 每个 tag 点击跳转到模板编辑标签页,右侧有 × 按钮取消选择
 *
 * 实现方式:
 *  1. 离屏渲染所有 tag(visibility: hidden, position: absolute),测量每个宽度
 *  2. 结合容器可用宽度 + "更多" 按钮预留宽度,决定可见的 tag 数量
 *  3. 前台仅渲染可见的 tag + 溢出计数按钮
 */
export function SelectedTemplateTags({
  templates,
  onOpen,
  onRemove,
}: SelectedTemplateTagsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [tagWidths, setTagWidths] = useState<number[]>([])
  const [overflowOpen, setOverflowOpen] = useState(false)

  // 监听外层容器宽度变化
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerWidth(e.contentRect.width)
      }
    })
    ro.observe(el)
    setContainerWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  // 每次 templates 变化,重新离屏测量各 tag 宽度
  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) {
      setTagWidths([])
      return
    }
    const nodes = Array.from(root.children) as HTMLElement[]
    const widths = nodes.map((n) => n.getBoundingClientRect().width)
    setTagWidths(widths)
  }, [templates])

  // 计算可见数量。8px = tag 之间的 gap;28px = "更多" 按钮估算宽度。
  const GAP = 6
  const MORE_BTN_WIDTH = 36
  let visibleCount = templates.length
  if (containerWidth > 0 && tagWidths.length === templates.length) {
    let used = 0
    visibleCount = 0
    for (let i = 0; i < templates.length; i++) {
      const w = tagWidths[i] + (i > 0 ? GAP : 0)
      // 若非最后一个,需预留 "更多" 按钮宽度;若是最后一个,不预留
      const isLast = i === templates.length - 1
      const reserve = isLast ? 0 : MORE_BTN_WIDTH + GAP
      if (used + w + reserve <= containerWidth) {
        used += w
        visibleCount++
      } else {
        break
      }
    }
    // 若刚好放不下最后一个,则整体退回一格以给"更多"按钮腾位
    if (
      visibleCount < templates.length &&
      visibleCount === templates.length - 1
    ) {
      // 这时至少还有 1 个隐藏项,以下逻辑保持
    }
  }

  const visible = templates.slice(0, visibleCount)
  const hidden = templates.slice(visibleCount)

  const handleTagClick = useCallback(
    (id: number) => {
      onOpen(id)
    },
    [onOpen],
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation()
      onRemove(id)
    },
    [onRemove],
  )

  if (templates.length === 0) {
    return <div ref={containerRef} className="min-w-0 flex-1" />
  }

  return (
    <div
      ref={containerRef}
      className="relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
    >
      {/* 离屏测量层 */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex gap-1.5 whitespace-nowrap"
      >
        {templates.map((tpl) => (
          <TemplateTag
            key={`m-${tpl.id}`}
            template={tpl}
            onClick={() => {}}
            onRemove={() => {}}
          />
        ))}
      </div>

      {/* 实际渲染 */}
      {visible.map((tpl) => (
        <TemplateTag
          key={tpl.id}
          template={tpl}
          onClick={() => handleTagClick(tpl.id)}
          onRemove={(e) => handleRemove(e, tpl.id)}
        />
      ))}

      {hidden.length > 0 && (
        <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                title={`还有 ${hidden.length} 个模板`}
                className={cn(
                  "flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-dashed px-1.5 text-[11px]",
                  "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                )}
              >
                <MoreHorizontal className="h-3 w-3" />
                <span>+{hidden.length}</span>
              </button>
            }
          />
          <PopoverContent side="top" align="start" className="w-64 p-1.5">
            <div className="mb-1 px-1.5 py-1 text-[11px] text-muted-foreground">
              已选模板 ({hidden.length})
            </div>
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {hidden.map((tpl) => (
                <li key={tpl.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs",
                      "hover:bg-muted/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOverflowOpen(false)
                        onOpen(tpl.id)
                      }}
                      className="min-w-0 flex-1 truncate text-left text-foreground"
                    >
                      {tpl.title || "未命名"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(tpl.id)}
                      title="取消选择"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

function TemplateTag({
  template,
  onClick,
  onRemove,
}: {
  template: Template
  onClick: () => void
  onRemove: (e: React.MouseEvent) => void
}) {
  return (
    <Badge
      variant="secondary"
      className="group h-6 max-w-[160px] shrink-0 gap-1 pl-2 pr-1 text-[11px] font-normal"
    >
      <button
        type="button"
        onClick={onClick}
        title={`打开模板: ${template.title || "未命名"}`}
        className="min-w-0 max-w-[130px] truncate text-left"
      >
        {template.title || "未命名"}
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="取消选择"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/80 hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </Badge>
  )
}