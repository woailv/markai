import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileSymlink,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react"
import { memo, useCallback } from "react"

import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store"
import type { TreeNode as TreeNodeData } from "@/store"

import {
  createDirectory,
  createFile,
  renameEntry,
  siblingNamesOf,
} from "./file-ops"
import { InlineNameEditor } from "./inline-name-editor"
import { useEditingStore } from "./use-editing-state"
import { loadDirectoryChildren } from "./use-workspace-events"

interface TreeNodeProps {
  path: string
  depth: number
  onContextMenu: (
    e: React.MouseEvent,
    path: string,
    isDir: boolean,
  ) => void
  matcher: (name: string) => boolean
  /** 搜索非空时,若该子树无命中则隐藏该分支 */
  branchHasMatch: (path: string) => boolean
  /** 计算当前可见的先序路径列表(用于 Shift 范围选择) */
  getVisibleOrder: () => string[]
  /** 处理原生拖拽开始事件(把选中项打包给外部) */
  onDragStart: (e: React.DragEvent, path: string) => void
}

/**
 * 单个目录/文件节点。
 * - 目录:双击/点击 chevron 展开;单击行仅做选择。
 * - 文件:点击选择(单选 / Ctrl 切换 / Shift 区间)。
 * - Ctrl/Shift 键不会触发展开,避免与多选冲突。
 */
export const TreeNode = memo(function TreeNode({
  path,
  depth,
  onContextMenu,
  matcher,
  branchHasMatch,
  getVisibleOrder,
  onDragStart,
}: TreeNodeProps) {
  const node = useWorkspaceStore((s) => s.nodes[path]) as
    | TreeNodeData
    | undefined
  const expanded = useWorkspaceStore((s) => s.expanded.has(path))
  const isMultiSelected = useWorkspaceStore((s) => s.selectedPaths.has(path))
  const isPrimary = useWorkspaceStore((s) => s.selectedPath === path)
  const showHidden = useWorkspaceStore((s) => s.showHidden)
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded)
  const selectOnly = useWorkspaceStore((s) => s.selectOnly)
  const toggleSelect = useWorkspaceStore((s) => s.toggleSelect)
  const rangeSelect = useWorkspaceStore((s) => s.rangeSelect)
  const editing = useEditingStore((s) => s.editing)
  const clearEditing = useEditingStore((s) => s.clear)

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      if (!node) return
      const modifier = e.ctrlKey || e.metaKey
      const shift = e.shiftKey

      if (shift) {
        rangeSelect(path, getVisibleOrder())
        return
      }
      if (modifier) {
        toggleSelect(path)
        return
      }

      // 单击:仅选中(不展开目录)。目录展开走 chevron / 双击。
      selectOnly(path)
    },
    [node, path, rangeSelect, toggleSelect, selectOnly, getVisibleOrder],
  )

  const handleDoubleClick = useCallback(async () => {
    if (!node || !node.entry.isDir) return
    const willExpand = !expanded
    toggleExpanded(path)
    if (willExpand && !node.loaded && !node.loading) {
      await loadDirectoryChildren(path)
    }
  }, [expanded, node, path, toggleExpanded])

  const handleChevronClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!node || !node.entry.isDir) return
      const willExpand = !expanded
      toggleExpanded(path)
      if (willExpand && !node.loaded && !node.loading) {
        await loadDirectoryChildren(path)
      }
    },
    [expanded, node, path, toggleExpanded],
  )

  if (!node) return null
  const { entry } = node

  // 隐藏文件过滤
  if (!showHidden && entry.isHidden) return null

  // 搜索过滤:若当前分支无命中,直接不渲染
  if (searchQuery && !branchHasMatch(path)) return null

  const isMatch = searchQuery ? matcher(entry.name) : false

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 右键节点未在多选内 → 视为单选;已在多选内 → 保持多选,菜单作用于整个多选
    if (!isMultiSelected) {
      selectOnly(path)
    }
    onContextMenu(e, path, entry.isDir)
  }

  const iconClass = "h-3.5 w-3.5 shrink-0"
  const chevronClass = "h-3 w-3 shrink-0"

  const selected = isMultiSelected || isPrimary

  // 重命名内联态:替换整个行渲染
  const isRenaming =
    editing?.kind === "rename" && editing.path === path
  // 新建内联态:当前节点是目标父目录且已展开
  const showCreateSlot =
    editing?.kind === "create" &&
    editing.parentPath === path &&
    entry.isDir &&
    expanded

  if (isRenaming) {
    const parentPath = entry.parent
    const siblings = siblingNamesOf(parentPath).filter((n) => n !== entry.name)
    return (
      <InlineNameEditor
        depth={depth}
        initialName={entry.name}
        isDir={entry.isDir}
        siblingNames={siblings}
        originalName={entry.name}
        onSubmit={async (name) => {
          const res = await renameEntry(path, name)
          if (res.ok) clearEditing()
        }}
        onCancel={clearEditing}
      />
    )
  }

  return (
    <div>
      <button
        type="button"
        data-tree-path={path}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContext}
        draggable
        onDragStart={(e) => onDragStart(e, path)}
        title={entry.path}
        className={cn(
          "group flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[12.5px] leading-tight",
          "hover:bg-muted/60",
          selected && "bg-primary/15 text-foreground hover:bg-primary/20",
          entry.isHidden && "opacity-60",
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {entry.isDir ? (
          <span
            onClick={handleChevronClick}
            className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
            role="button"
            aria-label={expanded ? "收起" : "展开"}
          >
            {node.loading ? (
              <Loader2 className={cn(chevronClass, "animate-spin")} />
            ) : expanded ? (
              <ChevronDown className={chevronClass} />
            ) : (
              <ChevronRight className={chevronClass} />
            )}
          </span>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
          {entry.isSymlink ? (
            <FileSymlink className={iconClass} />
          ) : entry.isDir ? (
            expanded ? (
              <FolderOpen className={cn(iconClass, "text-amber-500/80")} />
            ) : (
              <Folder className={cn(iconClass, "text-amber-500/80")} />
            )
          ) : (
            <FileIcon className={iconClass} />
          )}
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            isMatch && "rounded bg-yellow-500/20 px-1 text-foreground",
          )}
        >
          {entry.name}
        </span>
      </button>

      {entry.isDir && expanded && (
        <div>
          {showCreateSlot && editing?.kind === "create" && (
            <InlineNameEditor
              depth={depth + 1}
              initialName=""
              isDir={editing.isDir}
              siblingNames={siblingNamesOf(path)}
              onSubmit={async (name) => {
                const res = editing.isDir
                  ? await createDirectory(path, name)
                  : await createFile(path, name)
                if (res.ok) clearEditing()
              }}
              onCancel={clearEditing}
            />
          )}
          {node.error ? (
            <div
              className="px-2 py-1 text-[11px] text-destructive"
              style={{ paddingLeft: 6 + (depth + 1) * 12 }}
            >
              {node.error}
            </div>
          ) : !node.loaded && node.loading ? (
            <div
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground"
              style={{ paddingLeft: 6 + (depth + 1) * 12 }}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>加载中…</span>
            </div>
          ) : node.loaded && node.childrenPaths.length === 0 && !showCreateSlot ? (
            <div
              className="px-2 py-1 text-[11px] italic text-muted-foreground/70"
              style={{ paddingLeft: 6 + (depth + 1) * 12 }}
            >
              (空目录)
            </div>
          ) : (
            node.childrenPaths.map((childPath) => (
              <TreeNode
                key={childPath}
                path={childPath}
                depth={depth + 1}
                onContextMenu={onContextMenu}
                matcher={matcher}
                branchHasMatch={branchHasMatch}
                getVisibleOrder={getVisibleOrder}
                onDragStart={onDragStart}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
})