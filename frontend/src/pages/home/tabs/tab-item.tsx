import { MessagesSquare, FileText, FileCode2, X } from "lucide-react"
import type { MouseEvent } from "react"

import { cn } from "@/lib/utils"
import type { Tab } from "@/store"

interface TabItemProps {
  tab: Tab
  active: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

function iconFor(tab: Tab) {
  if (tab.kind === "chat") return MessagesSquare
  if (tab.kind === "template") return FileCode2
  return FileText
}

export function TabItem({ tab, active, onActivate, onClose }: TabItemProps) {
  const Icon = iconFor(tab)
  const dirty = "dirty" in tab && tab.dirty

  const handleMouseDown = (e: MouseEvent) => {
    // 中键关闭
    if (e.button === 1) {
      e.preventDefault()
      onClose(tab.id)
      return
    }
    if (e.button === 0) {
      onActivate(tab.id)
    }
  }

  const handleCloseClick = (e: MouseEvent) => {
    e.stopPropagation()
    onClose(tab.id)
  }

  return (
    <div
      role="tab"
      aria-selected={active}
      onMouseDown={handleMouseDown}
      title={tab.kind === "file" ? tab.path : tab.title}
      className={cn(
        "group relative flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border/60 px-3 text-xs transition-colors",
        active
          ? "bg-background text-foreground"
          : "bg-muted/40 text-muted-foreground hover:bg-muted/70",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="max-w-[160px] truncate">
        {tab.title || (tab.kind === "chat" ? "新会话" : "未命名")}
      </span>
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
      {active && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-primary" />
      )}
    </div>
  )
}