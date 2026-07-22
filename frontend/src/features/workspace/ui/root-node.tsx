import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
} from "lucide-react"
import { useCallback } from "react"

import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "../model/workspace.store"

interface RootNodeProps {
  /**
   * 根节点是否处于展开态。由父组件把 expanded.has(root) 传入,便于统一控制。
   */
  expanded: boolean
  /**
   * 右键回调。将根路径视为目录节点交给宿主的 handleContextMenu 处理,
   * 让"搜索"等操作可以复用现有菜单基础设施。
   */
  onContextMenu: (
    e: React.MouseEvent,
    path: string,
    isDir: boolean,
  ) => void
  /** 展开态切换 */
  onToggle: () => void
  /**
   * 展开时,由父组件负责渲染 rootChildren 对应的子树。
   * RootNode 只负责根节点这一行以及包裹容器。
   */
  children?: React.ReactNode
}

/**
 * 目录树中的"根节点"行。
 *
 * 需求:目录树顶部增加一行显示工作区根目录本身作为父级节点,其下再展开根目录的子项。
 * - 名称取路径最后一段,带目录图标
 * - 默认展开,可点击折叠/展开,行为与普通目录节点一致
 * - hover 时通过 title 展示完整根目录路径
 * - 无论工作区是否为空,始终显示
 *
 * 实现说明:
 * 根路径并不存在于 workspace.store 的 nodes 表中(nodes 只索引根下的条目)。
 * 因此本组件不复用 TreeNode,只承担这一行的展示 + 右键透传。子项渲染仍由
 * workspace-panel 通过 rootChildren + TreeNode 完成,注入到 children 里。
 */
export function RootNode({
  expanded,
  onContextMenu,
  onToggle,
  children,
}: RootNodeProps) {
  const root = useWorkspaceStore((s) => s.root)
  const label = getRootLabel(root)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // 与普通目录一致:单击不切换,双击才展开(见下)。
      // 但为了让根节点行为更接近 IDE 一贯做法,这里也允许单击折叠图标区。
      e.stopPropagation()
    },
    [],
  )

  const handleDoubleClick = useCallback(() => {
    onToggle()
  }, [onToggle])

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggle()
    },
    [onToggle],
  )

  const handleContext = useCallback(
    (e: React.MouseEvent) => {
      if (!root) return
      e.preventDefault()
      e.stopPropagation()
      onContextMenu(e, root, true)
    },
    [onContextMenu, root],
  )

  if (!root) return null

  const iconClass = "h-3.5 w-3.5 shrink-0"
  const chevronClass = "h-3 w-3 shrink-0"

  return (
    <div>
      <button
        type="button"
        data-tree-path={root}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContext}
        title={root}
        className={cn(
          "group flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[12.5px] leading-tight font-medium",
          "hover:bg-muted/60",
        )}
        style={{ paddingLeft: 6 }}
      >
        <span
          onClick={handleChevronClick}
          className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
          role="button"
          aria-label={expanded ? "收起" : "展开"}
        >
          {expanded ? (
            <ChevronDown className={chevronClass} />
          ) : (
            <ChevronRight className={chevronClass} />
          )}
        </span>
        <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
          {expanded ? (
            <FolderOpen className={cn(iconClass, "text-amber-500/80")} />
          ) : (
            <Folder className={cn(iconClass, "text-amber-500/80")} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>

      {expanded && <div>{children}</div>}
    </div>
  )
}

function getRootLabel(root: string): string {
  if (!root) return "工作区"
  const trimmed = root.replace(/[\\/]+$/, "")
  if (!trimmed) return "工作区"
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  if (idx < 0) return trimmed
  const base = trimmed.slice(idx + 1)
  return base || trimmed
}