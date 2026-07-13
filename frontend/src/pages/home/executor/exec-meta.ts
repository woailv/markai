import type { ExecutionReport } from "./command-executor"

/**
 * 将执行回执写回到 AI 原文末尾的 sentinel。
 *
 * 存储形态:
 *   <正文...>
 *
 *   <!--__EXEC_META__
 *   {json ExecutionReport}
 *   -->
 *
 * 选用 HTML 注释包裹:
 *   - Markdown / RichEditor 渲染时被视为注释,不影响正文视觉
 *   - 但仍会出现在纯文本复制里,故复制路径需先 stripExecMeta
 *   - 通过 JSON.stringify 保证跨 -->/> 的安全性:JSON 不含裸 -->
 *
 * 兼容旧数据:老会话里独立的 __EXEC_STATUS__ / __EXEC_REPORT__ 消息仍走原渲染路径。
 */

const META_OPEN = "<!--__EXEC_META__"
const META_CLOSE = "-->"

// 匹配整个 sentinel(含前置换行),用于剥离与替换
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