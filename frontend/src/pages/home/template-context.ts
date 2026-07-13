/**
 * 模板 token 展开工具。
 *
 * 消息中的模板以 [#name](template:///id) 形式存储,只显示模板名。
 * 复制场景下需要还原为完整模板内容(不含标题),再拼装进最终文本。
 *
 * 核心策略:
 * - 展开时按 token 在消息中出现的顺序去重收集,以保证复制文本的自然顺序
 * - 由外部传入模板全集(避免此模块耦合 service 调用与页面状态)
 * - 当 token 指向的模板已被删除,展开为占位注释,不阻断整体流程
 */
import { extractTemplateRefs } from "@/components/rich-editor"

import type { Template } from "./types"
import { buildTemplatePreview } from "./utils"

/**
 * 将若干消息内容中的模板 token 展开为一段前置的模板上下文文本。
 * 多个模板之间以分隔线连接,不再包裹在 <templates>...</templates> 中。
 * 若没有 token 或无法解析到任何模板,返回空串。
 */
export function buildTemplatesContext(
  contents: string[],
  templates: Template[],
): string {
  const refs = extractTemplateRefs(contents)
  if (refs.length === 0) return ""

  const byId = new Map<number, Template>()
  for (const t of templates) byId.set(t.id, t)

  const blocks: string[] = []
  for (const ref of refs) {
    const tpl = byId.get(ref.id)
    if (!tpl) {
      blocks.push(`<!-- 模板已删除: ${ref.name} (id=${ref.id}) -->`)
      continue
    }
    const { plain } = buildTemplatePreview(tpl)
    const body = plain.trim()
    if (body.length === 0) continue
    blocks.push(body)
  }

  if (blocks.length === 0) return ""
  return blocks.join("\n\n---\n\n")
}