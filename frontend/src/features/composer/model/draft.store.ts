import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * DraftStore 缓存输入框草稿内容(全局单份,不区分会话)。
 * - 通过 zustand/persist 落地到 localStorage,刷新/重启后恢复
 */
export interface DraftStore {
  draft: string
  getDraft: () => string
  setDraft: (content: string) => void
  clearDraft: () => void
}

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
      draft: "",
      getDraft: () => {
        const d = get().draft
        return typeof d === "string" ? d : String(d ?? "")
      },
      setDraft: (content) => {
        const safeContent = typeof content === "string" ? content : String(content ?? "")
        if (get().draft === safeContent) return
        set({ draft: safeContent })
      },
      clearDraft: () => {
        if (!get().draft) return
        set({ draft: "" })
      },
    }),
    {
      name: "prompttool-composer-drafts",
      version: 2,
    },
  ),
)