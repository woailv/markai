/**
 * 文件拖放目标相关常量。
 *
 * 被 widgets(chat-panel 的消息区域)与 features(composer 输入框、消息编辑器)
 * 共同引用,统一落点识别规则,避免各文件各自硬编码字符串漂移。
 */

/** 工作区拖出条目携带的自定义 MIME(与 features/workspace 保持一致)。 */
export const WORKSPACE_PATHS_MIME = "application/x-workspace-paths"

/**
 * 各 file-drop-target 的角色,用于区分落点类型。
 * - composer:消息输入框,真正的落点路由处理方。
 * - messageArea:会话消息区域,作为输入框的"代理落点",命中后转交给 composer。
 */
export const FILE_DROP_ROLE = {
  composer: "composer",
  messageArea: "message-area",
} as const

export type FileDropRole = (typeof FILE_DROP_ROLE)[keyof typeof FILE_DROP_ROLE]