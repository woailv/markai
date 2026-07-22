import type { MessageFragmentDTO } from "@/../bindings/prompttool/internal/services/conversation/models"

export interface ChatMessage {
  id: number | string
  role: "user" | "assistant"
  createdAt: string
  /**
   * 后端下发的结构化片段。所有消息(user / assistant)都按片段渲染:
   * - TEXT 片段(kind === "TEXT"):普通文本,原文存在 before 里
   * - 其他 kind:AI 指令(WRITE_FILE / EDIT_BLOCK / …)
   */
  fragments?: MessageFragmentDTO[]
}

/**
 * 从 fragments 中重建可读的纯文本表示,用于:
 *  - 用户消息气泡的展示
 *  - 复制到剪贴板 / 提取文件 token / 编辑输入初值
 *
 * 规则:按 orderIndex 升序拼接;TEXT / PARSE_ERROR 片段用 before 原文,
 * 其他指令片段有专门卡片渲染,不参与纯文本重建。
 */
export function fragmentsToPlainText(
  fragments: MessageFragmentDTO[] | undefined | null,
): string {
  if (!fragments || fragments.length === 0) return ""
  const sorted = [...fragments].sort((a, b) => a.orderIndex - b.orderIndex)
  const parts: string[] = []
  for (const f of sorted) {
    if (f.kind === "TEXT" || f.kind === "PARSE_ERROR") {
      parts.push(f.before)
    }
  }
  return parts.join("")
}

/**
 * 格式化时间为相对/绝对显示。
 * - < 1 分钟:刚刚
 * - < 1 小时:N 分钟前
 * - 今天:HH:mm
 * - 昨天:昨天 HH:mm
 * - 其他:MM-DD HH:mm 或 YYYY-MM-DD
 */
export function formatRelativeTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return typeof input === "string" ? input : ""
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "刚刚"
  if (diffMin < 60) return `${diffMin} 分钟前`

  const pad = (n: number) => String(n).padStart(2, "0")
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (isSameDay) return hm

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (isYesterday) return `昨天 ${hm}`

  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
