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
}

/**
 * 单个目录/文件节点。
 * - 目录:点击展开/收起;首次展开时惰性加载。
 * - 文件:点击选中(触发 store.selectedPath 更新)。
 * - 隐藏文件视具体开关决定是否渲染。
 */
export const TreeNode = memo(function TreeNode({
  path,
  depth,
  onContextMenu,
  matcher,
  branchHasMatch,
}: TreeNodeProps) {
  const node = useWorkspaceStore((s) => s.nodes[path]) as
    | TreeNodeData
    | undefined
  const expanded = useWorkspaceStore((s) => s.expanded.has(path))
  const selected = useWorkspaceStore((s) => s.selectedPath === path)
  const showHidden = useWorkspaceStore((s) => s.showHidden)
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded)
  const setSelected = useWorkspaceStore((s) => s.setSelected)

  if (!node) return null
  const { entry } = node

  // 隐藏文件过滤
  if (!showHidden && entry.isHidden) return null

  // 搜索过滤:若当前分支无命中,直接不渲染
  if (searchQuery && !branchHasMatch(path)) return null

  const isMatch = searchQuery ? matcher(entry.name) : false

  const handleClick = useCallback(async () => {
    if (entry.isDir) {
      const willExpand = !expanded
      toggleExpanded(path)
      if (willExpand && !node.loaded && !node.loading) {
        await loadDirectoryChildren(path)
      }
    } else {
      setSelected(path)
    }
  }, [entry.isDir, expanded, node.loaded, node.loading, path, setSelected, toggleExpanded])

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(e, path, entry.isDir)
  }

  const iconClass = "h-3.5 w-3.5 shrink-0"
  const chevronClass = "h-3 w-3 shrink-0"

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleContext}
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
          <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
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
          ) : node.loaded && node.childrenPaths.length === 0 ? (
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
              />
            ))
          )}
        </div>
      )}
    </div>
  )
})