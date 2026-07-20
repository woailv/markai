import { create } from "zustand"
import { persist } from "zustand/middleware"

import { ConversationService } from "@/../bindings/prompttool/internal/services/conversation"
import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/conversation/models"

/**
 * ConversationStore 承担两个职责:
 * 1) 记录当前激活会话 id(持久化)
 * 2) 缓存会话列表,供右侧 ChatPanel 顶栏的历史 Popover 使用
 *
 * 会话消息本身仍由 useChatSession 维护(与 activeConversationId 联动),
 * 这里只做"列表 + 当前指针"的最小职责,避免与消息 store 交叉污染。
 */
export interface ConversationStore {
  activeConversationId: number | null
  conversations: ConversationSummary[]
  loaded: boolean
  loading: boolean

  setActiveConversationId: (id: number | null) => void
  load: () => Promise<void>
  /** 置顶/取消置顶 */
  setPinned: (id: number, pinned: boolean) => Promise<void>
  rename: (id: number, title: string) => Promise<void>
  remove: (id: number) => Promise<void>
  /** 清空全部会话(逐条删除) */
  clearAll: () => Promise<void>
}

interface Persisted {
  activeConversationId: number | null
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
      activeConversationId: null,
      conversations: [],
      loaded: false,
      loading: false,

      setActiveConversationId: (id) => {
        if (get().activeConversationId === id) return
        set({ activeConversationId: id })
      },

      load: async () => {
        if (get().loading) return
        set({ loading: true })
        try {
          const list = (await ConversationService.List()) ?? []
          set({ conversations: list, loaded: true })
        } finally {
          set({ loading: false })
        }
      },

      setPinned: async (id, pinned) => {
        try {
          await ConversationService.SetPinned({
            conversationId: id,
            pinned,
          })
          await get().load()
        } catch (err) {
          console.error("[conversation] setPinned failed", err)
        }
      },

      rename: async (id, title) => {
        await ConversationService.Rename({
          conversationId: id,
          title,
        })
        await get().load()
      },

      remove: async (id) => {
        await ConversationService.Delete(id)
        const wasActive = get().activeConversationId === id
        await get().load()
        if (wasActive) {
          set({ activeConversationId: null })
        }
      },

      clearAll: async () => {
        const ids = get().conversations.map((c) => c.id)
        for (const id of ids) {
          await ConversationService.Delete(id)
        }
        set({ activeConversationId: null })
        await get().load()
      },
    }),
    {
      name: "prompttool-conversation",
      partialize: (state): Persisted => ({
        activeConversationId: state.activeConversationId,
      }),
    },
  ),
)