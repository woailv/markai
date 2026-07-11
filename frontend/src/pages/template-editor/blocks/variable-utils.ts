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