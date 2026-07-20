import { useWorkspaceStore } from "./workspace.store"

/**
 * 计算粘贴/拖入的目标目录:
 *   - 选中目录 → 该目录
 *   - 选中文件 → 该文件的父目录
 *   - 无选中 → 工作区根目录
 *   - 无工作区 → null
 */
export function resolvePasteTarget(): string | null {
  const state = useWorkspaceStore.getState()
  const { root, selectedPath, nodes } = state
  if (!root) return null

  if (selectedPath) {
    const node = nodes[selectedPath]
    if (node) {
      if (node.entry.isDir) return selectedPath
      return node.entry.parent || root
    }
  }
  return root
}

/**
 * 根据 DOM 元素向上找到最近的 tree 节点路径,并解析为目标目录。
 * 用于 drop 事件中优先按落点节点作为目标。
 */
export function resolveTargetFromElement(el: EventTarget | null): string | null {
  if (!(el instanceof Element)) return resolvePasteTarget()
  const hit = el.closest("[data-tree-path]") as HTMLElement | null
  if (!hit) return resolvePasteTarget()
  const path = hit.getAttribute("data-tree-path")
  if (!path) return resolvePasteTarget()

  const state = useWorkspaceStore.getState()
  const node = state.nodes[path]
  if (!node) return resolvePasteTarget()
  if (node.entry.isDir) return path
  return node.entry.parent || state.root || null
}