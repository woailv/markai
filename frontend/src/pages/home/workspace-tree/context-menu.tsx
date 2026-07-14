import {
  ClipboardCopy,
  ExternalLink,
  FilePlus2,
  RefreshCw,
} from "lucide-react"
import { useEffect, useMemo } from "react"

import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store"

import { emitFilesDropped } from "./selection-utils"
import type { ContextMenuState } from "./types"
import { refreshDirectoryChildren, refreshRoot } from "./use-workspace-events"

interface WorkspaceContextMenuProps {
  state: ContextMenuState
  onClose: () => void
}

/**
 * 右键菜单。目标集合规则:
 * - 若右键节点在多选内,则本次操作作用于整个多选(≥ 1 项);
 * - 否则仅作用于该单一节点。
 *
 * 操作:
 * - 添加到输入框:通过 files:dropped 事件让 RichComposer / MessageEditor 插入。
 * - 刷新:目录刷新其子项,文件刷新根。
 * - 在资源管理器中打开:后端接口未落地时,写路径到剪贴板。
 * - 复制绝对/相对路径:多个时按行拼接。
 * 关闭:点击其它区域、按 Esc、滚动、失焦。
 */
export function WorkspaceContextMenu({
  state,
  onClose,
}: WorkspaceContextMenuProps) {
  const root = useWorkspaceStore((s) => s.root)
  const selectedPaths = useWorkspaceStore((s) => s.selectedPaths)

  const targets = useMemo(() => {
    if (selectedPaths.has(state.targetPath) && selectedPaths.size > 0) {
      return Array.from(selectedPaths)
    }
    return [state.targetPath]
  }, [selectedPaths, state.targetPath])

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

  const handleInsertToInput = () => {
    // 不带坐标 → 接收方按聚焦目标(当前输入框 / 正在编辑的消息)插入
    emitFilesDropped(targets)
    onClose()
  }

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
      await navigator.clipboard.writeText(targets.join("\n"))
    } catch {
      /* ignore */
    }
    onClose()
  }

  const handleCopyRel = async () => {
    const text = targets.map((p) => toRelativePath(p, root)).join("\n")
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
    onClose()
  }

  const handleOpenInExplorer = () => {
    // 后端接口尚未落地时,先把路径写到剪贴板给用户使用。
    void navigator.clipboard.writeText(targets.join("\n"))
    onClose()
  }

  const count = targets.length
  const insertLabel =
    count > 1 ? `添加到输入框 (${count})` : "添加到输入框"

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
        className={cn(
          "fixed z-50 min-w-[200px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
        )}
        style={{ left: state.x, top: state.y }}
        role="menu"
      >
        <MenuItem
          icon={<FilePlus2 className="h-3.5 w-3.5" />}
          onClick={handleInsertToInput}
        >
          {insertLabel}
        </MenuItem>
        <div className="my-1 h-px bg-border" />
        <MenuItem
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={handleRefresh}
        >
          刷新
        </MenuItem>
        <MenuItem
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          onClick={handleOpenInExplorer}
        >
          在资源管理器中打开
        </MenuItem>
        <div className="my-1 h-px bg-border" />
        <MenuItem
          icon={<ClipboardCopy className="h-3.5 w-3.5" />}
          onClick={handleCopyAbs}
        >
          复制绝对路径{count > 1 ? ` (${count})` : ""}
        </MenuItem>
        <MenuItem
          icon={<ClipboardCopy className="h-3.5 w-3.5" />}
          onClick={handleCopyRel}
        >
          复制相对路径{count > 1 ? ` (${count})` : ""}
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