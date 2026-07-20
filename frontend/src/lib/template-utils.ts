import type { Template } from "@/entities/template"

/**
 * 去掉常见 markdown 语法,保留可读文本,用于列表摘要。
 */
export function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ") // 代码块
    .replace(/`([^`]+)`/g, "$1") // 行内代码
    .replace(/!\[[^\]]*]\([^)]*\)/g, "") // 图片
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1") // 链接
    .replace(/^#{1,6}\s+/gm, "") // 标题
    .replace(/^\s*[-*+]\s+/gm, "") // 无序列表
    .replace(/^\s*\d+\.\s+/gm, "") // 有序列表
    .replace(/^\s*>\s?/gm, "") // 引用
    .replace(/\*\*([^*]+)\*\*/g, "$1") // 加粗
    .replace(/\*([^*]+)\*/g, "$1") // 斜体
    .replace(/~~([^~]+)~~/g, "$1") // 删除线
    .replace(/\n{2,}/g, " · ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * 取首行非空文本作为摘要,最多 60 字符;去掉常见 markdown 前缀符号。
 * 迁移自原 `template-editor/blocks/variable-utils.ts` 的 `blockSummary`。
 */
export function firstLineSummary(content: string): string {
  const line = content
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0)
  if (!line) return ""
  const cleaned = line.replace(/^#+\s*/, "").replace(/^[-*>]\s+/, "")
  return cleaned.length > 60 ? cleaned.slice(0, 60) + "…" : cleaned
}

/**
 * 兼容旧数据:如果 content 是老版本的 `{"version":1,"blocks":[...]}` JSON,
 * 摊平为纯 Markdown 文本;否则原样返回。
 *
 * 新写入的模板始终以纯文本存储,老数据在第一次编辑保存时会被自动改写。
 */
export function flattenLegacyContent(raw: string): string {
  if (!raw) return ""
  // 快速排除非 JSON 对象,避免对普通 markdown 也走 try/catch
  const trimmed = raw.trimStart()
  if (!trimmed.startsWith("{")) return raw
  try {
    const parsed = JSON.parse(raw) as {
      version?: number
      blocks?: { content?: string }[]
    }
    if (
      parsed &&
      parsed.version === 1 &&
      Array.isArray(parsed.blocks) &&
      parsed.blocks.length > 0
    ) {
      return parsed.blocks.map((b) => b?.content ?? "").join("\n\n")
    }
  } catch {
    // 不是 JSON,按原文处理
  }
  return raw
}

export interface TemplatePreview {
  /** 摊平后的原始 Markdown 文本(用于复制/拼接上下文)。 */
  plain: string
  /** 去 Markdown 后的可读摘要(用于列表悬浮/单行显示)。 */
  summary: string
  /** 模板中出现的所有 {{var}} 变量名(去重,按出现顺序)。 */
  variables: string[]
  /** 摊平文本的字符数。 */
  chars: number
}

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g

export function buildTemplatePreview(tpl: Template): TemplatePreview {
  const plain = flattenLegacyContent(tpl.content)
  const summary = stripMarkdown(plain)
  const vars: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  VAR_RE.lastIndex = 0
  while ((m = VAR_RE.exec(plain))) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      vars.push(m[1])
    }
  }
  return {
    plain,
    summary,
    variables: vars,
    chars: plain.length,
  }
}