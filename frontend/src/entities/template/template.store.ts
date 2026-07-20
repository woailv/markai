import { create } from "zustand"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import type { PromptTemplate } from "@/../bindings/prompttool/internal/services/models"

/**
 * 模板列表 store。
 *
 * 与 conversation 类似,数据源在后端,前端只维护缓存 + 加载状态,
 * 由使用方(sidebar / tab / composer)统一 load() 触发刷新。
 *
 * 保持 store 里只放数据与远程操作,不放 UI 状态(open/selected 等)。
 */
export interface TemplateStore {
  templates: PromptTemplate[]
  loaded: boolean
  loading: boolean
  load: () => Promise<void>
  /** 通过 id 快速查找,返回引用或 undefined。 */
  getById: (id: number) => PromptTemplate | undefined
  /** 创建后写回本地缓存;返回新建结果供调用方(如 tab)绑定。 */
  create: (title: string, content: string) => Promise<PromptTemplate | null>
  update: (
    id: number,
    title: string,
    content: string,
  ) => Promise<PromptTemplate | null>
  remove: (id: number) => Promise<void>
  /** 批量删除全部模板,返回被清空前的 id 列表供上层做 tab 清理。 */
  clearAll: () => Promise<number[]>
}

export const useTemplateStore = create<TemplateStore>()((set, get) => ({
  templates: [],
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const list = (await PromptTemplateService.List()) ?? []
      set({ templates: list, loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  getById: (id) => get().templates.find((t) => t.id === id),

  create: async (title, content) => {
    const created = await PromptTemplateService.Create({ title, content })
    if (created) {
      // 新增放到最前(与后端 "按更新时间倒序" 保持一致的语义)
      set((state) => ({ templates: [created, ...state.templates] }))
    }
    return created ?? null
  },

  update: async (id, title, content) => {
    const updated = await PromptTemplateService.Update({ id, title, content })
    if (updated) {
      set((state) => ({
        templates: state.templates.map((t) => (t.id === id ? updated : t)),
      }))
    }
    return updated ?? null
  },

  remove: async (id) => {
    await PromptTemplateService.Delete(id)
    set((state) => ({
      templates: state.templates.filter((t) => t.id !== id),
    }))
  },

  clearAll: async () => {
    const ids = get().templates.map((t) => t.id)
    for (const id of ids) {
      await PromptTemplateService.Delete(id)
    }
    set({ templates: [] })
    return ids
  },
}))