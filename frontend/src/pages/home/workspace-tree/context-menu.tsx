import {
  ClipboardCopy,
  ExternalLink,
  RefreshCw,
} from "lucide-react"
import { useEffect } from "react"

import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store"

import type { ContextMenuState } from "./types"
import { refreshDirectoryChildren, refreshRoot } from "./use-workspace-events"

interface WorkspaceContextMenuProps {
  state: ContextMenuState
  onClose: () => void
}

/**
 * 右键菜单:刷新、在资源管理器中打开(占位,需要后端 shell.open 支持)、
 * 复制绝对路径、复制相对路径。
 * 关闭:点击其它区域、按 Esc、滚动、失焦。
 */
export function WorkspaceContextMenu({
  state,
  onClose,
}: WorkspaceContextMenuProps) {
  const root = useWorkspaceStore((s) => s.root)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    const onScroll = () => onClose()
    const onBlur = () => onClose()
    window.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("blur", onBlur)
    }
  }, [onClose])

  const handleRefresh = async () => {
    if (state.isDir) {
      await refreshDirectoryChildren(state.targetPath)
    } else {
      await refreshRoot()
    }
    onClose()
  }

  const handleCopyAbs = async () => {
    try {
      await navigator.clipboard.writeText(state.targetPath)
    } catch {
      /* ignore */
    }
    onClose()
  }

  const handleCopyRel = async () => {
    const rel = toRelativePath(state.targetPath, root)
    try {
      await navigator.clipboard.writeText(rel)
    } catch {
      /* ignore */
    }
    onClose()
  }

  const handleOpenInExplorer = () => {
    // 后端接口尚未落地时,先把路径写到剪贴板给用户使用。
    void navigator.clipboard.writeText(state.targetPath)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className={cn(
          "fixed z-50 min-w-[180px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
        )}
        style={{ left: state.x, top: state.y }}
        role="menu"
      >
        <MenuItem icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={handleRefresh}>
          刷新
        </MenuItem>
        <MenuItem icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={handleOpenInExplorer}>
          在资源管理器中打开
        </MenuItem>
        <div className="my-1 h-px bg-border" />
        <MenuItem icon={<ClipboardCopy className="h-3.5 w-3.5" />} onClick={handleCopyAbs}>
          复制绝对路径
        </MenuItem>
        <MenuItem icon={<ClipboardCopy className="h-3.5 w-3.5" />} onClick={handleCopyRel}>
          复制相对路径
        </MenuItem>
      </div>
    </>
  )
}

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
      role="menuitem"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span>{children}</span>
    </button>
  )
}

function toRelativePath(abs: string, root: string): string {
  if (!root) return abs
  if (abs === root) return "."
  const sep = abs.includes("\\") ? "\\" : "/"
  const prefix = root.endsWith(sep) ? root : root + sep
  if (abs.startsWith(prefix)) return abs.slice(prefix.length)
  return abs
}