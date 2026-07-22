import {
  File as FileIcon,
  Folder,
  Search as SearchIcon,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { requestOpenFile } from "@/shared/model"
import { useWorkspaceStore } from "../model/workspace.store"
import type { TreeNode } from "../model/workspace.store"

interface WorkspaceSearchDialogProps {
  /** 搜索作用域:目录绝对路径。为 root 时表示搜索整个工作区。 */
  scopePath: string
  onClose: () => void
}

interface Hit {
  path: string
  name: string
  isDir: boolean
  /** 相对 scopePath 的相对路径,用于结果展示 */
  rel: string
}

/**
 * 判断 childPath 是否位于 parentPath 之下(含相等)。
 * 兼容 Windows / POSIX 分隔符,处理 parentPath 是否以分隔符结尾。
 */
function isUnderScope(childPath: string, parentPath: string): boolean {
  if (!parentPath) return true
  if (childPath === parentPath) return true
  const sep = parentPath.includes("\\") ? "\\" : "/"
  const prefix = parentPath.endsWith(sep) ? parentPath : parentPath + sep
  return childPath.startsWith(prefix)
}

function toRelative(path: string, scope: string): string {
  if (!scope || path === scope) return ""
  const sep = scope.includes("\\") ? "\\" : "/"
  const prefix = scope.endsWith(sep) ? scope : scope + sep
  if (path.startsWith(prefix)) return path.slice(prefix.length)
  return path
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"))
  return idx >= 0 ? p.slice(idx + 1) : p
}

/**
 * 工作区内按名称搜索的对话框。
 *
 * - 数据来源:workspace.store 的 nodes 扁平表(useWorkspaceEvents 首次挂载时
 *   已通过 ListAll 一次性拉取全部条目);不再触发后端调用。
 * - 匹配规则:名称包含关键字(不区分大小写),隐藏文件参与匹配。
 * - 命中上限:200,避免大仓库瞬间渲染过多结果。
 */
export function WorkspaceSearchDialog({
  scopePath,
  onClose,
}: WorkspaceSearchDialogProps) {
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const nodes = useWorkspaceStore((s) => s.nodes)
  const root = useWorkspaceStore((s) => s.root)
  const expandAncestors = useWorkspaceStore((s) => s.expandAncestors)
  const setExpanded = useWorkspaceStore((s) => s.setExpanded)
  const selectOnly = useWorkspaceStore((s) => s.selectOnly)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const hits: Hit[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const result: Hit[] = []
    const limit = 200
    for (const path of Object.keys(nodes)) {
      const node: TreeNode | undefined = nodes[path]
      if (!node) continue
      const { entry } = node
      // 作用域过滤:必须严格位于 scopePath 之下(scope 本身不作为结果)
      if (path === scopePath) continue
      if (!isUnderScope(path, scopePath)) continue
      if (!entry.name.toLowerCase().includes(q)) continue
      result.push({
        path,
        name: entry.name,
        isDir: entry.isDir,
        rel: toRelative(path, scopePath),
      })
      if (result.length >= limit) break
    }
    // 目录在前,其后按相对路径字典序
    result.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.rel.localeCompare(b.rel, undefined, { sensitivity: "base" })
    })
    return result
  }, [query, nodes, scopePath])

  const scopeLabel = useMemo(() => {
    if (!scopePath || scopePath === root) return basename(root) || "工作区"
    const rel = toRelative(scopePath, root)
    return rel || basename(scopePath)
  }, [scopePath, root])

  /** 定位到目录节点:展开祖先与自身,选中并滚入视口。 */
  const revealDirectory = (path: string) => {
    expandAncestors(path)
    setExpanded(path, true)
    selectOnly(path)
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-tree-path="${cssEscape(path)}"]`,
      )
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  }

  const applyHit = (hit: Hit) => {
    if (hit.isDir) {
      revealDirectory(hit.path)
    } else {
      // 展开父目录以便用户在树上也能看到该文件
      expandAncestors(hit.path)
      selectOnly(hit.path)
      requestOpenFile(hit.path, hit.name, "pin")
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
      return
    }
    if (hits.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const hit = hits[activeIndex]
      if (hit) applyHit(hit)
    }
  }

  // 键盘导航时把活动项滚入可视区
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-hit-index="${activeIndex}"]`,
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  return (
    <div className="fixed inset-0 z-[900] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative z-10 flex w-[520px] max-w-[92vw] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按名称搜索…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onClose}
            title="关闭 (Esc)"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          在 <span className="font-medium text-foreground">{scopeLabel}</span>{" "}
          目录下搜索
        </div>
        <div
          ref={listRef}
          className="max-h-[50vh] min-h-[80px] overflow-y-auto"
        >
          {query.trim() === "" ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              输入关键字开始搜索
            </div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              未找到匹配项
            </div>
          ) : (
            hits.map((hit, idx) => (
              <button
                key={hit.path}
                type="button"
                data-hit-index={idx}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => applyHit(hit)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                  idx === activeIndex
                    ? "bg-primary/15"
                    : "hover:bg-muted/60",
                )}
                title={hit.path}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                  {hit.isDir ? (
                    <Folder className="h-3.5 w-3.5 text-amber-500/80" />
                  ) : (
                    <FileIcon className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{hit.name}</span>
                  {hit.rel && hit.rel !== hit.name && (
                    <span className="ml-2 text-[10.5px] text-muted-foreground">
                      {hit.rel}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {hit.isDir ? "目录" : "文件"}
                </span>
              </button>
            ))
          )}
        </div>
        {hits.length > 0 && (
          <div className="border-t bg-muted/40 px-3 py-1 text-[10.5px] text-muted-foreground">
            共 {hits.length} 项 · ↑/↓ 选择 · Enter 打开 · Esc 关闭
          </div>
        )}
      </div>
    </div>
  )
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s)
  }
  return s.replace(/["\\]/g, "\\$&")
}