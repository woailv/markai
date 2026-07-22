/**
 * AI 消息尾部 sentinel 的类型与解码。
 *
 * 与 Go 侧 internal/services/conversation/aiproto 保持一致。
 * 前端不再自己解析 XML 指令 — segments 已由后端整理好放入 sentinel 里,
 * 这里只做 JSON 抽取。
 */

import type { ExecResultBase } from "./types"

export type CommandKind =
  | "WRITE_FILE"
  | "EDIT_FILE"
  | "DELETE_FILE"
  | "MOVE_PATH"
  | "CREATE_DIRECTORY"
  | "REQUEST_DIRECTORY_LIST"
  | "REQUEST_FILE"

export interface SearchReplaceBlock {
  search: string
  replace: string
}

/** 后端 Command 结构的联合形式。字段按 kind 取用。 */
export interface Command {
  kind: CommandKind
  path?: string
  content?: string
  edits?: SearchReplaceBlock[]
  source?: string
  destination?: string
}

/** 单个 segment:一段普通文本、一条命令(附执行结果)、或一次解析错误 */
export type ExecSegment =
  | { type: "text"; value: string }
  | { type: "cmd"; command: Command; result?: ExecResultBase }
  | { type: "parseError"; raw?: string; message?: string; result?: ExecResultBase }

export interface ExecMeta {
  status: "pending" | "done"
  batchId?: number
  totalCommands: number
  segments: ExecSegment[]
}

const META_OPEN = "<!--__EXEC_META__"
/** 匹配整个 sentinel(含前置换行) */
const META_RE = /\n*<!--__EXEC_META__\n([\s\S]*?)\n-->\s*$/

/** 从消息内容中解出 sentinel;不存在或格式非法返回 null。 */
export function decodeExecMeta(content: string): ExecMeta | null {
  const m = META_RE.exec(content)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1]) as ExecMeta
    if (parsed?.status !== "pending" && parsed?.status !== "done") return null
    if (!Array.isArray(parsed.segments)) return null
    return parsed
  } catch {
    return null
  }
}

/** 剥离 sentinel,返回纯正文(通常用于编辑框回填)。 */
export function stripExecMeta(content: string): string {
  return content.replace(META_RE, "")
}

/**
 * 从 sentinel segments 中取出所有 REQUEST_FILE / REQUEST_DIRECTORY_LIST
 * 的路径,按出现顺序去重。前端不再自己 parse XML,这里从后端已解析好的
 * 结构中直接读。
 */
export function extractRequestPathsFromMeta(contents: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const content of contents) {
    const meta = decodeExecMeta(content)
    if (!meta) continue
    for (const seg of meta.segments) {
      if (seg.type !== "cmd") continue
      const kind = seg.command.kind
      if (kind !== "REQUEST_FILE" && kind !== "REQUEST_DIRECTORY_LIST") continue
      const p = seg.command.path
      if (!p) continue
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
  }
  return out
}

/** 快速判断内容是否携带 sentinel。 */
export function hasExecMeta(content: string): boolean {
  return content.includes(META_OPEN)
}
