import type { ExecutionReport } from "./types"

/**
 * 执行回执消息的编解码。
 *
 * 两类载体:
 *
 * 1. 独立回执消息(老会话历史兼容),content 直接以魔法首行标记:
 *    __EXEC_STATUS__\n{"pending":N}
 *    __EXEC_REPORT__\n{...ExecutionReport}
 *
 * 2. AI 原文末尾的隐藏 sentinel(推荐):
 *    <正文>
 *
 *    <!--__EXEC_META__
 *    {json ExecMeta}
 *    -->
 *
 *    HTML 注释保证 Markdown / RichEditor 渲染时被视为注释,不影响正文视觉;
 *    JSON.stringify 保证不产生裸 -->,可以安全嵌入注释。
 */

// ---------- 独立消息 ----------

export const EXEC_STATUS_TAG = "__EXEC_STATUS__"
export const EXEC_REPORT_TAG = "__EXEC_REPORT__"

export function encodeExecStatus(pending: number): string {
  return `${EXEC_STATUS_TAG}\n${JSON.stringify({ pending })}`
}

export function encodeExecReport(report: ExecutionReport): string {
  return `${EXEC_REPORT_TAG}\n${JSON.stringify(report)}`
}

export interface DecodedExec {
  type: "status" | "report"
  status?: { pending: number }
  report?: ExecutionReport
}

export function decodeExecPayload(content: string): DecodedExec | null {
  if (content.startsWith(EXEC_STATUS_TAG)) {
    try {
      const json = content.slice(EXEC_STATUS_TAG.length).trim()
      return { type: "status", status: JSON.parse(json) }
    } catch {
      return null
    }
  }
  if (content.startsWith(EXEC_REPORT_TAG)) {
    try {
      const json = content.slice(EXEC_REPORT_TAG.length).trim()
      return { type: "report", report: JSON.parse(json) }
    } catch {
      return null
    }
  }
  return null
}

// ---------- 内嵌 sentinel ----------

const META_OPEN = "<!--__EXEC_META__"
const META_CLOSE = "-->"

/** 匹配整个 sentinel(含前置换行) */
const META_RE = /\n*<!--__EXEC_META__\n([\s\S]*?)\n-->\s*$/

export interface ExecMeta {
  status: "pending" | "done"
  pending?: number
  report?: ExecutionReport
}

export function encodeExecMeta(meta: ExecMeta): string {
  return `\n\n${META_OPEN}\n${JSON.stringify(meta)}\n${META_CLOSE}`
}

export function decodeExecMeta(content: string): ExecMeta | null {
  const m = META_RE.exec(content)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1]) as ExecMeta
    if (parsed && (parsed.status === "pending" || parsed.status === "done")) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/** 从消息内容中剥离 sentinel,返回纯正文 */
export function stripExecMeta(content: string): string {
  return content.replace(META_RE, "")
}

/**
 * 将 sentinel 追加或替换到消息末尾。
 * 若原文已有 sentinel 则替换,否则直接追加。
 */
export function withExecMeta(content: string, meta: ExecMeta): string {
  const clean = stripExecMeta(content)
  return clean + encodeExecMeta(meta)
}
