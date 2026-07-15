import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers"
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import type { Tab } from "@/store"
import { useTabStore } from "@/store"

import { requestCloseTab } from "./close-coordinator"
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
  const [menuOpen, setMenuOpen] = useState(false)

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

  const [overInfo, setOverInfo] = useState<{
    overId: string
    before: boolean
  } | null>(null)

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) {
      setOverInfo(null)
      return
    }
    // 用 delta 简单判定插入到目标前/后
    const overRect = over.rect
    const activeRect = e.active.rect.current.translated
    if (!activeRect || !overRect) return
    const activeCenter = activeRect.left + activeRect.width / 2
    const overCenter = overRect.left + overRect.width / 2
    setOverInfo({
      overId: String(over.id),
      before: activeCenter < overCenter,
    })
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    setOverInfo(null)
    if (!over || active.id === over.id) return
    const info = overInfo
    // fall back:没有 info 时用 rect 判定
    let before = true
    if (info && info.overId === over.id) {
      before = info.before
    } else if (over.rect && e.active.rect.current.translated) {
      before =
        e.active.rect.current.translated.left + e.active.rect.current.translated.width / 2 <
        over.rect.left + over.rect.width / 2
    }
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
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setOverInfo(null)}
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
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              "flex h-full w-7 items-center justify-center text-muted-foreground hover:bg-muted",
              menuOpen && "bg-muted",
            )}
            aria-label="所有标签"
            aria-expanded={menuOpen}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {menuOpen && (
            <AllTabsMenu
              tabs={ordered}
              activeTabId={activeTabId}
              onClose={() => setMenuOpen(false)}
              onPick={(id) => {
                activateTab(id)
                setMenuOpen(false)
              }}
              onCloseTab={(id) => {
                void requestCloseTab(id)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface AllTabsMenuProps {
  tabs: Tab[]
  activeTabId: string | null
  onClose: () => void
  onPick: (id: string) => void
  onCloseTab: (id: string) => void
}

function AllTabsMenu({
  tabs,
  activeTabId,
  onClose,
  onPick,
  onCloseTab,
}: AllTabsMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="menu"
        className="absolute right-0 top-full z-50 mt-1 max-h-[60vh] w-72 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
      >
        {tabs.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">没有标签</div>
        )}
        {tabs.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted",
              t.id === activeTabId && "bg-muted/70",
            )}
          >
            <button
              type="button"
              onClick={() => onPick(t.id)}
              className="flex-1 truncate text-left"
              title={t.kind === "file" ? t.path : t.title}
            >
              {t.title || (t.kind === "chat" ? "新会话" : "未命名")}
            </button>
            {!t.pinned && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(t.id)
                }}
                className="rounded-sm px-1 text-muted-foreground hover:bg-foreground/10"
                aria-label="关闭"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}