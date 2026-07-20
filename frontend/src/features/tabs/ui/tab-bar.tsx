import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers"
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable"
import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { Tab } from "../model/tab.store"
import { useTabStore } from "../model/tab.store"

import { requestCloseTab } from "../model/close-coordinator"
import { SortableTabItem } from "./tab-item"

/**
 * TabBar 顶部标签栏:
 * - 拖拽重排(pinned 区与非 pinned 区独立)
 * - 溢出时左右滚动按钮
 * - "所有标签"下拉,方便在多 tab 时快速跳转
 */
export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activateTab = useTabStore((s) => s.activateTab)
  const reorderTab = useTabStore((s) => s.reorderTab)

  // 固定 tab 排前,其余保持原顺序(稳定排序)
  const ordered = [...tabs]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const pa = a.t.pinned ? 0 : 1
      const pb = b.t.pinned ? 0 : 1
      if (pa !== pb) return pa - pb
      return a.i - b.i
    })
    .map((x) => x.t)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useLayoutEffect(() => {
    updateScrollState()
  }, [ordered.length, updateScrollState])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => updateScrollState()
    el.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(() => updateScrollState())
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [updateScrollState])

  // 激活的 tab 滚动到可视区
  useEffect(() => {
    if (!activeTabId) return
    const el = scrollRef.current
    if (!el) return
    const target = el.querySelector<HTMLElement>(
      `[data-tab-id="${activeTabId}"]`,
    )
    if (!target) return
    const elRect = el.getBoundingClientRect()
    const tgtRect = target.getBoundingClientRect()
    if (tgtRect.left < elRect.left) {
      el.scrollBy({ left: tgtRect.left - elRect.left - 12, behavior: "smooth" })
    } else if (tgtRect.right > elRect.right) {
      el.scrollBy({
        left: tgtRect.right - elRect.right + 12,
        behavior: "smooth",
      })
    }
  }, [activeTabId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    // 用 ordered 数组中的索引来判定 before/after,而不是依赖 dnd-kit
    // 拖拽过程中已经动画移动过的 rect(那样比较中心点几乎无差,结果不稳定,
    // 导致 store 顺序看起来"没变"→ tab 掉回原位)。
    const srcIdx = ordered.findIndex((t) => t.id === String(active.id))
    const dstIdx = ordered.findIndex((t) => t.id === String(over.id))
    if (srcIdx < 0 || dstIdx < 0) return
    
    // 向右拖(srcIdx < dstIdx):插到 target 之后;向左拖:插到 target 之前。
    const before = srcIdx > dstIdx
    reorderTab(String(active.id), String(over.id), before)
  }

  const scrollByAmount = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" })
  }

  return (
    <div className="relative flex h-9 shrink-0 items-center border-b bg-muted/30">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-160)}
          className="flex h-full w-6 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted"
          aria-label="向左滚动"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <DndContext
        sensors={sensors}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={ordered.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            ref={scrollRef}
            role="tablist"
            className="flex h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {ordered.map((t) => (
              <SortableTabItem
                key={t.id}
                tab={t}
                active={t.id === activeTabId}
                onActivate={activateTab}
                onClose={(id) => void requestCloseTab(id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(160)}
          className="flex h-full w-6 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted"
          aria-label="向右滚动"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {ordered.length > 0 && (
        <AllTabsMenu
          tabs={ordered}
          activeTabId={activeTabId}
          onPick={activateTab}
          onCloseTab={(id) => void requestCloseTab(id)}
        />
      )}
    </div>
  )
}

interface AllTabsMenuProps {
  tabs: Tab[]
  activeTabId: string | null
  onPick: (id: string) => void
  onCloseTab: (id: string) => void
}

function AllTabsMenu({
  tabs,
  activeTabId,
  onPick,
  onCloseTab,
}: AllTabsMenuProps) {
  const [open, setOpen] = useState(false)

  const pinned = tabs.filter((t) => t.pinned)
  const unpinned = tabs.filter((t) => !t.pinned)

  const renderItem = (t: Tab) => {
    const isActive = t.id === activeTabId
    return (
      <DropdownMenuItem
        key={t.id}
        onSelect={(e) => {
          e.preventDefault()
          onPick(t.id)
          setOpen(false)
        }}
        className={cn(
          "flex items-center gap-2 pr-1",
          isActive && "bg-accent/60",
        )}
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary">
          {isActive && <Check className="h-3.5 w-3.5" />}
        </span>
        <span
          className="flex-1 truncate"
          title={t.kind === "file" ? t.path : t.title}
        >
          {t.title || "未命名"}
        </span>
        {!t.pinned && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onCloseTab(t.id)
            }}
            className="rounded-sm p-0.5 text-muted-foreground opacity-70 hover:bg-foreground/10 hover:opacity-100"
            aria-label="关闭"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          "flex h-full w-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted",
          open && "bg-muted",
        )}
        aria-label="所有标签"
      >
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="max-h-[60vh] w-72 overflow-y-auto"
      >
        {tabs.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">没有标签</div>
        )}
        {pinned.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              固定
            </DropdownMenuLabel>
            {pinned.map(renderItem)}
            {unpinned.length > 0 && <DropdownMenuSeparator />}
          </>
        )}
        {unpinned.length > 0 && pinned.length > 0 && (
          <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            其他
          </DropdownMenuLabel>
        )}
        {unpinned.map(renderItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}