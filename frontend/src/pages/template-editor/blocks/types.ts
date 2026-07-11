export type BlockType = "markdown"

export interface TemplateBlock {
  id: string
  type: BlockType
  content: string
}

export interface TemplateDocument {
  version: 1
  blocks: TemplateBlock[]
}

export const TEMPLATE_DOC_VERSION = 1 as const