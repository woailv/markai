import type { TemplateBlock } from "./types"

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g
const PATH_RE =
  /(@[\w./\\-]+\.[a-zA-Z0-9]+)|((?:\.{1,2}\/|[a-zA-Z]:[\\/])[\w./\\-]+\.[a-zA-Z0-9]+)/g

export function extractVariables(blocks: TemplateBlock[]): string[] {
  const set = new Set<string>()
  for (const b of blocks) {
    VAR_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = VAR_RE.exec(b.content))) set.add(m[1])
  }
  return Array.from(set).sort()
}

export function extractPaths(blocks: TemplateBlock[]): string[] {
  const set = new Set<string>()
  for (const b of blocks) {
    PATH_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PATH_RE.exec(b.content))) set.add(m[0])
  }
  return Array.from(set).sort()
}

export function countChars(blocks: TemplateBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.content.length, 0)
}

/**
 * 取块首行非空文本作为摘要,最多 60 字符。
 */
export function blockSummary(content: string): string {
  const line = content
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0)
  if (!line) return ""
  // 去掉常见 markdown 标记
  const cleaned = line.replace(/^#+\s*/, "").replace(/^[-*>]\s+/, "")
  return cleaned.length > 60 ? cleaned.slice(0, 60) + "…" : cleaned
}