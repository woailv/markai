import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AlertTriangle,
  FileCode2,
  FileText,
  MessagesSquare,
  Pin,
  X,
} from "lucide-react"
import { useEffect, useRef, useState, type MouseEvent } from "react"

import { cn } from "@/lib/utils"
import type { Tab } from "@/store"
import { useTabStore } from "@/store"

import { requestCloseTabs } from "./close-coordinator"

interface TabItemProps {
  tab: Tab
  active: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

/**
 * 供 TabBar 用 dnd-kit 包一层的 sortable 版本;
 * 保留原 TabItem 作为纯展示组件,便于在非拖拽场景(如"所有标签"菜单)复用。
 */
export function SortableTabItem(props: TabItemProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.tab.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TabItem {...props} />
    </div>
  )
}

function iconFor(tab: Tab) {
  if (tab.kind === "chat") return MessagesSquare
  if (tab.kind === "template") return FileCode2
  return FileText
}

export function TabItem({ tab, active, onActivate, onClose }: TabItemProps) {
  const Icon = iconFor(tab)
  const dirty = "dirty" in tab && tab.dirty
  const preview = tab.kind === "file" && tab.preview === true
  const invalid = tab.kind === "file" && tab.invalid === true
  const pinned = !!tab.pinned

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const togglePin = useTabStore((s) => s.togglePin)
  const promoteToPermanent = useTabStore((s) => s.promoteToPermanent)

  /** 关闭"其他 / 右侧 / 全部"时,统一走 dirty 询问流程。 */
  const collectTargets = (mode: "others" | "right" | "all"): string[] => {
    const all = useTabStore.getState().tabs
    if (mode === "others") {
      return all.filter((t) => t.id !== tab.id && !t.pinned).map((t) => t.id)
    }
    if (mode === "right") {
      const idx = all.findIndex((t) => t.id === tab.id)
      if (idx < 0) return []
      return all.slice(idx + 1).filter((t) => !t.pinned).map((t) => t.id)
    }
    return all.filter((t) => !t.pinned).map((t) => t.id)
  }

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      onClose(tab.id)
      return
    }
    if (e.button === 0) {
      onActivate(tab.id)
    }
  }

  const handleDoubleClick = () => {
    // 双击预览 tab → 固化为正式 tab
    if (preview) promoteToPermanent(tab.id)
  }

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onActivate(tab.id)
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const handleCloseClick = (e: MouseEvent) => {
    e.stopPropagation()
    onClose(tab.id)
  }

  const closeMenu = () => setMenu(null)

  return (
    <>
      <div
        role="tab"
        aria-selected={active}
        data-tab-id={tab.id}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        title={tab.kind === "file" ? tab.path : tab.title}
        className={cn(
          "group relative flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border/60 px-3 text-xs transition-colors",
          active
            ? "bg-background text-foreground"
            : "bg-muted/40 text-muted-foreground hover:bg-muted/70",
        )}
      >
        {invalid ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
        )}
        <span
          className={cn(
            "max-w-[160px] truncate",
            preview && "italic",
            invalid && "text-destructive/80 line-through decoration-dotted",
          )}
        >
          {tab.title || (tab.kind === "chat" ? "新会话" : "未命名")}
        </span>
        {pinned && !dirty && (
          <Pin className="h-3 w-3 shrink-0 text-primary/70" />
        )}
        {!pinned && (
          <button
            type="button"
            onClick={handleCloseClick}
            className={cn(
              "ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-foreground/10",
              dirty ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label="关闭标签"
          >
            {dirty ? (
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </button>
        )}
        {pinned && dirty && (
          <span
            className="ml-1 h-1.5 w-1.5 rounded-full bg-foreground/70"
            aria-label="有未保存改动"
          />
        )}
        {active && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-primary" />
        )}
      </div>
      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          tab={tab}
          pinned={pinned}
          onClose={closeMenu}
          onCloseTab={() => {
            closeMenu()
            onClose(tab.id)
          }}
          onCloseOthers={() => {
            closeMenu()
            void requestCloseTabs(collectTargets("others"))
          }}
          onCloseRight={() => {
            closeMenu()
            void requestCloseTabs(collectTargets("right"))
          }}
          onCloseAll={() => {
            closeMenu()
            void requestCloseTabs(collectTargets("all"))
          }}
          onTogglePin={() => {
            closeMenu()
            togglePin(tab.id)
          }}
        />
      )}
    </>
  )
}

interface TabContextMenuProps {
  x: number
  y: number
  tab: Tab
  pinned: boolean
  onClose: () => void
  onCloseTab: () => void
  onCloseOthers: () => void
  onCloseRight: () => void
  onCloseAll: () => void
  onTogglePin: () => void
}

/**
 * 简易 tab 右键菜单。file tab 额外提供"复制路径 / 在资源管理器中显示"。
 * 与 workspace 的 context-menu 保持视觉一致(轻量,不引入 base-ui 的 Menu)。
 */
function TabContextMenu({
  x,
  y,
  tab,
  pinned,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  onTogglePin,
}: TabContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [onClose])

  const handleCopyPath = async () => {
    if (tab.kind !== "file") return
    try {
      await navigator.clipboard.writeText(tab.path)
    } catch {
      /* ignore */
    }
    onClose()
  }

  const handleShowInExplorer = async () => {
    if (tab.kind !== "file") return
    try {
      const { FileService } = await import(
        "@/../bindings/prompttool/internal/services"
      )
      await FileService.OpenInExplorer(tab.path)
    } catch (err) {
      console.error("[tab-item] OpenInExplorer failed", err)
    }
    onClose()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={rootRef}
        className="fixed z-50 min-w-[180px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        style={{ left: x, top: y }}
        role="menu"
      >
        <MenuItem onClick={onCloseTab} disabled={pinned}>
          关闭
        </MenuItem>
        <MenuItem onClick={onCloseOthers}>关闭其他</MenuItem>
        <MenuItem onClick={onCloseRight}>关闭右侧全部</MenuItem>
        <MenuItem onClick={onCloseAll}>关闭全部</MenuItem>
        <div className="my-1 h-px bg-border" />
        <MenuItem onClick={onTogglePin}>
          {pinned ? "取消固定" : "固定标签"}
        </MenuItem>
        {tab.kind === "file" && (
          <>
            <div className="my-1 h-px bg-border" />
            <MenuItem onClick={handleCopyPath}>复制路径</MenuItem>
            <MenuItem onClick={handleShowInExplorer}>
              在资源管理器中显示
            </MenuItem>
          </>
        )}
      </div>
    </>
  )
}

function MenuItem({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center px-3 py-1.5 text-left text-xs",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted",
      )}
      role="menuitem"
    >
      {children}
    </button>
  )
}