import {
  blocksToPlainText,
  parseTemplateContent,
} from "@/pages/template-editor/blocks/serializer"
import type { TemplateBlock } from "@/pages/template-editor/blocks/types"

import type { Template } from "./types"

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

export interface TemplatePreview {
  blocks: TemplateBlock[]
  plain: string
  summary: string
  variables: string[]
  chars: number
}

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g

export function buildTemplatePreview(tpl: Template): TemplatePreview {
  const blocks = parseTemplateContent(tpl.content)
  const plain = blocksToPlainText(blocks)
  const summary = stripMarkdown(plain)
  const vars = new Set<string>()
  let m: RegExpExecArray | null
  VAR_RE.lastIndex = 0
  while ((m = VAR_RE.exec(plain))) vars.add(m[1])
  return {
    blocks,
    plain,
    summary,
    variables: Array.from(vars),
    chars: plain.length,
  }
}