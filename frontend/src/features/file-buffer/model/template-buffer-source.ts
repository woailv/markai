import { useTemplateStore } from "@/entities/template"

import { flattenLegacyContent } from "@/lib/template-utils"
import type {
  BufferExternalChange,
  BufferLoadResult,
  BufferSaveResult,
  BufferSource,
} from "./buffer-source"

/**
 * 模板数据源。仅支持已落库的模板(templateId 必须非 null),
 * "新建"由外层弹框先落库再打开 tab 承担,这里不再处理 create 分支。
 *
 * subscribe 通过 zustand 订阅 templates 数组:
 *  - 模板 title/content 在别处被修改 → modified
 *  - 模板被删除 → removed
 */
export class TemplateBufferSource implements BufferSource {
  readonly usesModTime = false
  readonly key: string
  private readonly templateId: number
  /** 记录上次 load 时的 content,用于识别外部 modified 与自身 save 引起的变化。 */
  private lastSyncedContent = ""
  private lastSyncedTitle = ""

  constructor(templateId: number) {
    this.templateId = templateId
    this.key = `template:${templateId}`
  }

  async load(): Promise<BufferLoadResult> {
    const store = useTemplateStore.getState()
    if (!store.loaded) await store.load()
    const tpl = useTemplateStore.getState().getById(this.templateId)
    if (!tpl) throw new Error("模板不存在或已被删除")
    const plain = flattenLegacyContent(tpl.content)
    this.lastSyncedContent = plain
    this.lastSyncedTitle = tpl.title
    return { content: plain, modTime: 0, size: plain.length }
  }

  async save(content: string): Promise<BufferSaveResult> {
    const store = useTemplateStore.getState()
    const tpl = store.getById(this.templateId)
    if (!tpl) return { ok: false, error: "模板已被删除" }
    const updated = await store.update(this.templateId, tpl.title, content)
    if (!updated) return { ok: false, error: "保存失败" }
    this.lastSyncedContent = content
    this.lastSyncedTitle = updated.title
    return { ok: true, modTime: 0, size: content.length }
  }

  subscribe(cb: (change: BufferExternalChange) => void): () => void {
    return useTemplateStore.subscribe((state, prev) => {
      const cur = state.templates.find((t) => t.id === this.templateId)
      const prevTpl = prev.templates.find((t) => t.id === this.templateId)
      if (!cur) {
        if (prevTpl) cb({ type: "removed" })
        return
      }
      const plain = flattenLegacyContent(cur.content)
      const contentChanged = plain !== this.lastSyncedContent
      const titleChanged = cur.title !== this.lastSyncedTitle
      if (contentChanged || titleChanged) {
        cb({ type: "modified" })
      }
    })
  }
}