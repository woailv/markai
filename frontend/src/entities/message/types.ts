import type { MessageFragmentDTO } from "@/../bindings/prompttool/internal/services/conversation/models"

export interface ChatMessage {
  id: number | string
  role: "user" | "assistant"
  content: string
  createdAt: string
  /** 后端下发的结构化修改片段。仅 AI 消息可能非空。 */
  fragments?: MessageFragmentDTO[]
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
