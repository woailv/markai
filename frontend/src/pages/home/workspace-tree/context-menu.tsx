import {
  ClipboardCopy,
  ExternalLink,
  FilePlus2,
  FilePlus,
  FolderPlus,
  ListTree,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo } from "react"

import { FileService } from "@/../bindings/prompttool/internal/services"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store"

import { resolveCreationParent } from "./file-ops"
import { emitFilesDropped } from "./selection-utils"
import type { ContextMenuState } from "./types"
import { useEditingStore } from "./use-editing-state"
import { refreshDirectoryChildren, refreshRoot } from "./use-workspace-events"

interface WorkspaceContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  /** 请求宿主发起删除(带确认对话框)。 */
  onRequestDelete: (paths: string[]) => void
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
  onRequestDelete,
}: WorkspaceContextMenuProps) {
  const root = useWorkspaceStore((s) => s.root)
  const selectedPaths = useWorkspaceStore((s) => s.selectedPaths)
  const nodes = useWorkspaceStore((s) => s.nodes)
  const setExpanded = useWorkspaceStore((s) => s.setExpanded)
  const startCreate = useEditingStore((s) => s.startCreate)
  const startRename = useEditingStore((s) => s.startRename)

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

  const handleOpenInExplorer = async () => {
    try {
      // 避免一次性打开过多窗口，限制最多同时打开前 5 个选中项
      await Promise.all(
        targets.slice(0, 5).map((t) => FileService.OpenInExplorer(t)),
      )
    } catch (err) {
      console.error("[workspace] OpenInExplorer failed:", err)
    }
    onClose()
  }

  const handleNew = (isDir: boolean) => {
    // 命中位置:若目标是目录则在其内部,否则在其父目录。
    const parent = resolveCreationParent(state.targetPath)
    // 若是目录则确保展开,让内联输入行可见
    if (parent && parent !== root) {
      setExpanded(parent, true)
    }
    startCreate(parent, isDir)
    onClose()
  }

  const handleRename = () => {
    startRename(state.targetPath)
    onClose()
  }

  const handleDelete = () => {
    onRequestDelete(targets)
    onClose()
  }

  const canRename = !!nodes[state.targetPath]

  /**
   * 生成选中项的目录树结构,插入到当前聚焦的输入框或消息编辑器中。
   * 定位聚焦编辑器的策略与 files:dropped 一致:查找 data-file-drop-target
   * 容器内的 contenteditable,然后用 document.execCommand("insertText")
   * 把 tree 文本包裹在 ```text ``` 代码块中插入,避免破坏富文本结构。
   */
  const handleInsertTree = async () => {
    try {
      const result = await FileService.GenerateTree({
        paths: targets,
        maxDepth: 8,
      })
      const treeText = result?.treeText?.trim()
      if (!treeText) {
        onClose()
        return
      }

      const wrapped = `\n\`\`\`text\n${treeText}\n\`\`\`\n`

      // 定位聚焦的可编辑区域
      const active = document.activeElement as HTMLElement | null
      let editable: HTMLElement | null = null

      if (active && active.isContentEditable) {
        editable = active
      } else {
        const targets = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-file-drop-target="true"]',
          ),
        )
        for (const t of targets) {
          const ce = t.querySelector<HTMLElement>('[contenteditable="true"]')
          if (ce) {
            editable = ce
            break
          }
        }
      }

      if (editable) {
        editable.focus()
        // execCommand 已被标注为遗留 API,但在 ProseMirror / contenteditable
        // 富文本编辑器中仍是最兼容的"在光标处插入纯文本"手段。
        const ok = document.execCommand("insertText", false, wrapped)
        if (!ok) {
          // 兜底:降级为剪贴板
          await navigator.clipboard.writeText(wrapped)
        }
      } else {
        // 无聚焦编辑器 → 复制到剪贴板
        await navigator.clipboard.writeText(wrapped)
      }
    } catch {
      /* ignore */
    }
    onClose()
  }

  const count = targets.length
  const insertLabel =
    count > 1 ? `添加到输入框 (${count})` : "添加到输入框"
  const treeLabel =
    count > 1 ? `插入目录树 (${count})` : "插入目录树"
  const deleteLabel = count > 1 ? `删除 (${count})` : "删除"

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
        <MenuItem
          icon={<ListTree className="h-3.5 w-3.5" />}
          onClick={handleInsertTree}
        >
          {treeLabel}
        </MenuItem>
        <div className="my-1 h-px bg-border" />
        <MenuItem
          icon={<FilePlus className="h-3.5 w-3.5" />}
          onClick={() => handleNew(false)}
        >
          新建文件
        </MenuItem>
        <MenuItem
          icon={<FolderPlus className="h-3.5 w-3.5" />}
          onClick={() => handleNew(true)}
        >
          新建文件夹
        </MenuItem>
        <MenuItem
          icon={<Pencil className="h-3.5 w-3.5" />}
          onClick={handleRename}
          disabled={!canRename || count > 1}
        >
          重命名
        </MenuItem>
        <MenuItem
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={handleDelete}
          tone="danger"
        >
          {deleteLabel}
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
  disabled,
  tone,
}: {
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  tone?: "danger"
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-muted",
        tone === "danger" && !disabled && "text-destructive hover:bg-destructive/10",
      )}
      role="menuitem"
    >
      <span
        className={cn(
          "text-muted-foreground",
          tone === "danger" && !disabled && "text-destructive",
        )}
      >
        {icon}
      </span>
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