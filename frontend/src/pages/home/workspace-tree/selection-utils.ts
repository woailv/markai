import { Events } from "@wailsio/runtime"

import type { TreeNode } from "@/store"

/**
 * 按当前树的展开/隐藏状态,先序遍历得到可见节点的路径顺序。
 * 用于 Shift 范围选择:锚点 → 目标之间的所有可见项都会被选中。
 *
 * @param rootChildren 根一级的有序子路径
 * @param nodes 节点扁平表
 * @param expanded 已展开目录的集合
 * @param showHidden 是否显示隐藏文件
 * @param matcher 搜索命中函数,可空表示不做搜索过滤
 * @param branchHasMatch 分支是否含命中(与 workspace-panel 中一致)
 */
export function computeVisibleOrder(
  rootChildren: string[],
  nodes: Record<string, TreeNode>,
  expanded: Set<string>,
  showHidden: boolean,
  searchQuery: string,
  matcher: (name: string) => boolean,
  branchHasMatch: (path: string) => boolean,
): string[] {
  const order: string[] = []
  const walk = (path: string) => {
    const node = nodes[path]
    if (!node) return
    const { entry } = node
    if (!showHidden && entry.isHidden) return
    if (searchQuery && !branchHasMatch(path)) return
    order.push(path)
    if (entry.isDir && expanded.has(path)) {
      for (const child of node.childrenPaths) walk(child)
    }
  }
  for (const p of rootChildren) walk(p)
  return order
}

/**
 * 以与后端"文件拖入"完全一致的方式,向 RichEditor 家族(RichComposer /
 * MessageEditor)发送一次文件插入事件。这样目录树的拖拽、右键菜单可以
 * 直接复用现成的目标选择与插入逻辑,不再需要新的通道。
 *
 * @param paths 绝对路径列表
 * @param coords 落点坐标(拖放时提供);缺省时接收方按聚焦目标插入
 */
export function emitFilesDropped(
  paths: string[],
  coords?: { x: number; y: number },
): void {
  if (!paths.length) return
  const payload = coords
    ? { paths, hasCoords: true, x: coords.x, y: coords.y }
    : { paths, hasCoords: false }
  // Wails v3 Events.Emit 签名为 (name, ...data)。此前误传对象字面量
  // 导致后端 JSON 解析失败(name 字段应为 string)。
  // 这是纯前端事件,未在 Go 后端定义,所以跳过 CustomEvents 的强类型检查。
  void (Events.Emit as any)("files:dropped", payload)
}