/**
 * 面板布局常量。从 workspace / right-panel store 中抽出,
 * 供页面组合层与各 store 复用,避免布局与状态耦合。
 */

export const WORKSPACE_LAYOUT = {
  MIN_WIDTH: 200,
  MAX_WIDTH: 520,
  DEFAULT_WIDTH: 280,
  COLLAPSED_WIDTH: 36,
} as const

export const CHAT_PANEL_LAYOUT = {
  MIN_WIDTH: 320,
  MAX_WIDTH: 720,
  DEFAULT_WIDTH: 440,
  COLLAPSED_WIDTH: 0,
} as const
