import { v4 as uuid } from "uuid"

import {
  TEMPLATE_DOC_VERSION,
  type TemplateBlock,
  type TemplateDocument,
} from "./types"

export function createEmptyBlock(): TemplateBlock {
  return { id: uuid(), type: "markdown", content: "" }
}

/**
 * 解析后端存储的 content 字符串为块数组。
 * 兼容旧数据:纯文本 -> 单个 markdown 块。
 */
export function parseTemplateContent(raw: string): TemplateBlock[] {
  if (!raw) return [createEmptyBlock()]
  try {
    const parsed = JSON.parse(raw) as Partial<TemplateDocument>
    if (
      parsed &&
      parsed.version === TEMPLATE_DOC_VERSION &&
      Array.isArray(parsed.blocks) &&
      parsed.blocks.length > 0
    ) {
      return parsed.blocks.map((b) => ({
        id: b.id || uuid(),
        type: b.type ?? "markdown",
        content: b.content ?? "",
      }))
    }
  } catch {
    // fallthrough: 视为纯文本
  }
  return [{ id: uuid(), type: "markdown", content: raw }]
}

export function serializeBlocks(blocks: TemplateBlock[]): string {
  const doc: TemplateDocument = {
    version: TEMPLATE_DOC_VERSION,
    blocks,
  }
  return JSON.stringify(doc)
}

/**
 * 将块数组渲染为纯文本预览(用于详情页快速展示)。
 */
export function blocksToPlainText(blocks: TemplateBlock[]): string {
  return blocks.map((b) => b.content).join("\n\n---\n\n")
}