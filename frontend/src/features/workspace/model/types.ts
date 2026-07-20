/**
 * ContextMenuState 右键菜单的位置与目标。仅 workspace 内部使用,
 * 因此保留在 features/workspace/model 下,而不放到 entities。
 */
export interface ContextMenuState {
  x: number
  y: number
  targetPath: string
  isDir: boolean
}
