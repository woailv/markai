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
 *
 * @param contents  消息内容片段,用于提取内联 token
 * @param templates 模板全集,用于按 id 查找完整定义
 * @param extraIds  可选的额外模板 id 集合(如已勾选但未内联插入的模板)。
 *                  这些 id 会追加到内联 token 之后按发现顺序展开,重复项自动去重。
 */
export function buildTemplatesContext(
  contents: string[],
  templates: Template[],
  extraIds?: Iterable<number>,
): string {
  const refs = extractTemplateRefs(contents)

  const byId = new Map<number, Template>()
  for (const t of templates) byId.set(t.id, t)

  // 合并顺序:先内联 token(按出现顺序),再追加未被 token 覆盖的额外 id
  const seen = new Set<number>()
  const orderedIds: Array<{ id: number; name?: string }> = []
  for (const ref of refs) {
    if (seen.has(ref.id)) continue
    seen.add(ref.id)
    orderedIds.push({ id: ref.id, name: ref.name })
  }
  if (extraIds) {
    for (const id of extraIds) {
      if (seen.has(id)) continue
      seen.add(id)
      orderedIds.push({ id })
    }
  }

  if (orderedIds.length === 0) return ""

  const blocks: string[] = []
  for (const item of orderedIds) {
    const tpl = byId.get(item.id)
    if (!tpl) {
      const label = item.name ?? "unknown"
      blocks.push(`<!-- 模板已删除: ${label} (id=${item.id}) -->`)
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