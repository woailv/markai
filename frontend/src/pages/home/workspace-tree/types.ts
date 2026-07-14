import type { WorkspaceEntry } from "@/../bindings/prompttool/internal/services/models"

/**
 * WorkspaceChangedEvent 后端 fsnotify 推送的载荷。
 * 事件名统一为 "workspace:changed"。
 */
export interface WorkspaceChangedEvent {
  /** 变更类型。后端当前常量:create / remove / rename / modify;delete、move 保留兼容。 */
  type: "create" | "remove" | "delete" | "rename" | "modify" | "move"
  /** 受影响的绝对路径(rename/move 时为新路径) */
  path: string
  /** 父目录绝对路径 */
  parent: string
  /** 变更后的节点元数据(create/modify/rename 目标) */
  entry?: WorkspaceEntry
  /** rename/move 的旧路径 */
  oldPath?: string
  /** 事件序号,用于并发去重 */
  seq?: number
}

/**
 * ContextMenuState 右键菜单的位置与目标。
 */
export interface ContextMenuState {
  x: number
  y: number
  targetPath: string
  isDir: boolean
}