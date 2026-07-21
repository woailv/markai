import {
  ClipboardCopy,
  Code2,
  ExternalLink,
  FilePlus2,
  FilePlus,
  FileText,
  FolderPlus,
  ListTree,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo } from "react"

import { FileService } from "@/../bindings/prompttool/internal/services/file"
import { SkeletonService } from "@/../bindings/prompttool/internal/services/skeleton"
import { toast } from "./toast"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { requestOpenFile } from "@/shared/model"
import { useWorkspaceStore } from "../model/workspace.store"

import { resolveCreationParent } from "../model/file-ops"
import { emitFilesDropped } from "../model/selection-utils"
import type { ContextMenuState } from "../model/types"
import { useEditingStore } from "../model/use-editing-state"
import { refreshDirectoryChildren, refreshRoot } from "../model/use-workspace-events"

interface WorkspaceContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  /** 请求宿主发起删除(带确认对话框)。 */
  onRequestDelete: (paths: string[]) => void
}

/**
 * 工作区右键菜单(基于 shadcn base-ui ContextMenu)。
 *
 * 触发方式:
 * 外部(tree-node)在 onContextMenu 中通过 onOpenAt 定位坐标并置为 open;
 * 本组件用一个 0×0 的定位锚 anchor 元素承载,base-ui ContextMenu 在受控模式下
 * 渲染 popup。关闭时回调 onClose,恢复宿主 state。
 *
 * 目标集合规则:
 * - 若右键节点在多选内,则本次操作作用于整个多选(≥ 1 项);
 * - 否则仅作用于该单一节点。
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
  const nodesMap = useWorkspaceStore((s) => s.nodes)
  const startCreate = useEditingStore((s) => s.startCreate)
  const startRename = useEditingStore((s) => s.startRename)

  const targets = useMemo(() => {
    if (selectedPaths.has(state.targetPath) && selectedPaths.size > 0) {
      return Array.from(selectedPaths)
    }
    return [state.targetPath]
  }, [selectedPaths, state.targetPath])

  // 滚动 / 失焦时关闭。Esc 与外部点击由 base-ui ContextMenu 自处理。
  useEffect(() => {
    const onScroll = () => onClose()
    const onBlur = () => onClose()
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("blur", onBlur)
    }
  }, [onClose])

  const handleInsertToInput = () => {
    if (!targets.length) return
    // 与拖拽路径保持一致:统一通过 files:dropped 事件交由接收方
    // (RichEditor 家族)按其内置的 markdown 文件引用格式插入,
    // 避免右键与拖拽产生两种不同的输出格式。
    emitFilesDropped(targets)
  }

  const handleRefresh = async () => {
    if (state.isDir) {
      await refreshDirectoryChildren(state.targetPath)
    } else {
      await refreshRoot()
    }
  }

  const handleCopyAbs = async () => {
    try {
      await navigator.clipboard.writeText(targets.join("\n"))
    } catch {
      /* ignore */
    }
  }

  const handleCopyRel = async () => {
    const text = targets.map((p) => toRelativePath(p, root)).join("\n")
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  const handleOpenInExplorer = async () => {
    try {
      await Promise.all(
        targets.slice(0, 5).map((t) => FileService.OpenInExplorer(t)),
      )
    } catch (err) {
      console.error("[workspace] OpenInExplorer failed:", err)
    }
  }

  const handleNew = (isDir: boolean) => {
    const parent = resolveCreationParent(state.targetPath)
    // 延迟到菜单卸载之后再修改编辑态,避免 base-ui ContextMenu 关闭时
    // 与 store 更新竞态导致 startCreate 被同帧覆盖 / 输入框未挂载。
    setTimeout(() => {
      if (parent && parent !== root) {
        setExpanded(parent, true)
      }
      startCreate(parent, isDir)
    }, 0)
  }

  const handleRename = () => {
    const target = state.targetPath
    setTimeout(() => {
      startRename(target)
    }, 0)
  }

  const handleOpenInNewTab = () => {
    for (const p of targets) {
      const n = nodesMap[p]
      if (n && !n.entry.isDir) {
        requestOpenFile(p, n.entry.name, "pin")
      }
    }
  }

  const anyFileTarget = targets.some((p) => {
    const n = nodesMap[p]
    return n && !n.entry.isDir
  })

  const handleDelete = () => {
    onRequestDelete(targets)
  }

  const canRename = !!nodes[state.targetPath]

  const handleInsertTree = async () => {
    try {
      const result = await FileService.GenerateTree({
        paths: targets,
        maxDepth: 8,
      })
      const treeText = result?.treeText?.trim()
      if (!treeText) return

      const wrapped = `\n\`\`\`text\n${treeText}\n\`\`\`\n`

      const inserted = insertTextIntoActiveEditor(wrapped)
      if (!inserted) {
        await navigator.clipboard.writeText(wrapped)
      }
    } catch {
      /* ignore */
    }
  }

  // 骨架提取的目标即为右键 / 多选的全部路径:
  // 后端会自动递归目录并跳过不支持的扩展名,因此这里不再过滤文件与目录。
  const handleInsertSkeleton = async () => {
    if (targets.length === 0) return
    try {
      const result = await SkeletonService.Extract(targets).catch(() => null)
      const items = result?.items ?? []

      const supported: { path: string; skeleton: string }[] = []
      const unsupported: string[] = []
      const failed: string[] = []

      for (const item of items) {
        if (item.error) {
          failed.push(item.path)
          continue
        }
        if (!item.supported) {
          unsupported.push(item.path)
          continue
        }
        const body = (item.skeleton ?? "").trim()
        if (!body) {
          unsupported.push(item.path)
          continue
        }
        supported.push({ path: item.path, skeleton: body })
      }

      if (supported.length === 0) {
        const detail =
          unsupported.length > 0
            ? `不支持的文件类型:${unsupported
                .slice(0, 3)
                .map(basename)
                .join("、")}${unsupported.length > 3 ? " 等" : ""}`
            : failed.length > 0
              ? "提取失败"
              : undefined
        toast.info("无可插入骨架", detail)
        return
      }

      const blocks = supported.map(({ path, skeleton }) => {
        const rel = toRelativePath(path, root)
        return `\n\`\`\` ${rel}\n${skeleton}\n\`\`\`\n`
      })
      const wrapped = blocks.join("")

      const inserted = insertTextIntoActiveEditor(wrapped)
      if (!inserted) {
        await navigator.clipboard.writeText(wrapped)
        toast.success(
          "已复制骨架到剪贴板",
          supported.length > 1 ? `共 ${supported.length} 个文件` : undefined,
        )
      } else if (unsupported.length > 0) {
        toast.info(
          `已插入骨架(跳过 ${unsupported.length} 个不支持文件)`,
          unsupported
            .slice(0, 3)
            .map(basename)
            .join("、") + (unsupported.length > 3 ? " 等" : ""),
        )
      }
    } catch (err) {
      toast.error("插入骨架失败", String((err as Error)?.message ?? err))
    }
  }

  const count = targets.length
  const insertLabel = count > 1 ? `添加到输入框 (${count})` : "添加到输入框"
  const treeLabel = count > 1 ? `插入目录树 (${count})` : "插入目录树"
  const skeletonLabel = count > 1 ? `插入骨架 (${count})` : "插入骨架"
  const deleteLabel = count > 1 ? `删除 (${count})` : "删除"

  // 用一个 0×0 的锚点承载定位;ContextMenu 受控 open,通过 anchor 定位到点击坐标
  return (
    <ContextMenu
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <ContextMenuContent
        className="min-w-[200px]"
        anchor={{ getBoundingClientRect: () => makeRect(state.x, state.y) }}
      >
        {anyFileTarget && (
          <ContextMenuItem onClick={handleOpenInNewTab}>
            <FileText className="h-3.5 w-3.5" />
            <span>在新标签中打开</span>
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={handleInsertToInput}>
          <FilePlus2 className="h-3.5 w-3.5" />
          <span>{insertLabel}</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleInsertTree}>
          <ListTree className="h-3.5 w-3.5" />
          <span>{treeLabel}</span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={targets.length === 0}
          onClick={handleInsertSkeleton}
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>{skeletonLabel}</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => handleNew(false)}>
          <FilePlus className="h-3.5 w-3.5" />
          <span>新建文件</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleNew(true)}>
          <FolderPlus className="h-3.5 w-3.5" />
          <span>新建文件夹</span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canRename || count > 1}
          onClick={handleRename}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>重命名</span>
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          <span>{deleteLabel}</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>刷新</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleOpenInExplorer}>
          <ExternalLink className="h-3.5 w-3.5" />
          <span>在资源管理器中打开</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleCopyAbs}>
          <ClipboardCopy className="h-3.5 w-3.5" />
          <span>
            复制绝对路径{count > 1 ? ` (${count})` : ""}
          </span>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopyRel}>
          <ClipboardCopy className="h-3.5 w-3.5" />
          <span>
            复制相对路径{count > 1 ? ` (${count})` : ""}
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * 定位当前可插入的富文本编辑器并写入纯文本(用于目录树代码块等非文件引用场景)。
 * 优先使用聚焦的 contenteditable;否则回退到页面上首个 file-drop 目标
 * 内的 contenteditable。返回是否成功插入。
 *
 * 注意:文件引用的插入不要走这里,应通过 emitFilesDropped 让接收方
 * 按统一的 markdown 文件引用格式处理,以与拖拽路径保持一致。
 */
function insertTextIntoActiveEditor(text: string): boolean {
  const active = document.activeElement as HTMLElement | null
  let editable: HTMLElement | null = null

  if (active && active.isContentEditable) {
    editable = active
  } else {
    const dropTargets = Array.from(
      document.querySelectorAll<HTMLElement>('[data-file-drop-target="true"]'),
    )
    for (const t of dropTargets) {
      const ce = t.querySelector<HTMLElement>('[contenteditable="true"]')
      if (ce) {
        editable = ce
        break
      }
    }
  }

  if (!editable) return false
  editable.focus()
  const ok = document.execCommand("insertText", false, text)
  return ok
}

function makeRect(x: number, y: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x,
    bottom: y,
    width: 0,
    height: 0,
    toJSON() {
      return this
    },
  } as DOMRect
}

function toRelativePath(abs: string, root: string): string {
  if (!root) return abs
  if (abs === root) return "."
  const sep = abs.includes("\\") ? "\\" : "/"
  const prefix = root.endsWith(sep) ? root : root + sep
  if (abs.startsWith(prefix)) return abs.slice(prefix.length)
  return abs
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"))
  return idx >= 0 ? p.slice(idx + 1) : p
}

