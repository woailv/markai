import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/**
 * Tab 元信息。仅存"这个 tab 是什么"以及最少展示字段,
 * 具体内容(消息/文件内容)由各自的 Panel 通过 hook 加载,不放在这里。
 */
export type Tab =
  | {
      kind: "chat"
      id: string
      /** null 表示未落库的临时新会话 tab */
      conversationId: number | null
      title: string
      pinned?: boolean
    }
  | {
      kind: "file"
      id: string
      path: string
      title: string
      dirty?: boolean
      pinned?: boolean
    }
  | {
      kind: "template"
      id: string
      /** null 表示未保存的新模板 tab */
      templateId: number | null
      title: string
      dirty?: boolean
      pinned?: boolean
    }

export type TabKind = Tab["kind"]

export interface TabStore {
  tabs: Tab[]
  activeTabId: string | null

  /** 打开(或激活已存在的)会话 tab。conversationId=null 表示新会话临时 tab。 */
  openChatTab: (conversationId: number | null, title?: string) => string
  /** 显式打开一个空的新会话 tab(总是新建,不复用)。 */
  openNewChatTab: () => string

  /** 关闭 tab。若关闭的是激活 tab,自动激活相邻 tab。 */
  closeTab: (tabId: string) => void
  /** 激活指定 tab。 */
  activateTab: (tabId: string) => void
  /** 更新 tab 的展示标题。 */
  updateTitle: (tabId: string, title: string) => void
  /**
   * 将一个未绑定 conversationId 的 chat tab 绑定到真实的 conversationId。
   * 若目标 conversationId 已被其他 chat tab 占用,会合并到那个 tab 并关闭当前 tab。
   */
  bindConversation: (tabId: string, conversationId: number) => void
  /** 当会话在别处被删除时,清理相关 tab(其 conversationId 变为 null,标题回退)。 */
  onConversationDeleted: (conversationId: number) => void
}

const genId = () =>
  `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

/** 找出 conversationId 已绑定的 chat tab id(如果存在)。 */
function findChatTabByConvId(tabs: Tab[], convId: number): Tab | undefined {
  return tabs.find(
    (t) => t.kind === "chat" && t.conversationId === convId,
  )
}

/** 计算关闭 tab 后应该激活的 tab id。 */
function pickNextActive(
  tabs: Tab[],
  closedIndex: number,
  activeTabId: string | null,
): string | null {
  if (tabs.length === 0) return null
  // 若被关闭的不是当前激活 tab,保持当前激活
  const closedTab = tabs[closedIndex]
  if (activeTabId !== closedTab.id) return activeTabId
  // 优先激活右侧,否则左侧
  const nextIndex = Math.min(closedIndex, tabs.length - 2)
  const remaining = tabs.filter((_, i) => i !== closedIndex)
  if (remaining.length === 0) return null
  return remaining[Math.max(0, Math.min(nextIndex, remaining.length - 1))].id
}

export const useTabStore = create<TabStore>()(
  persist(
    (set) => ({
  tabs: [],
  activeTabId: null,

  openChatTab: (conversationId, title = "新会话") => {
    let resultId = ""
    set((state) => {
      // 已落库会话 → 复用已有 tab
      if (conversationId !== null) {
        const existing = findChatTabByConvId(state.tabs, conversationId)
        if (existing) {
          resultId = existing.id
          return { activeTabId: existing.id }
        }
      }
      const id = genId()
      resultId = id
      const newTab: Tab = {
        kind: "chat",
        id,
        conversationId,
        title,
      }
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: id,
      }
    })
    return resultId
  },

  openNewChatTab: () => {
    let resultId = ""
    set((state) => {
      // 若已存在未绑定 conversationId 的新会话 tab,直接激活它,避免重复创建
      const existingNew = state.tabs.find(
        (t) => t.kind === "chat" && t.conversationId === null,
      )
      if (existingNew) {
        resultId = existingNew.id
        return state.activeTabId === existingNew.id
          ? state
          : { activeTabId: existingNew.id }
      }
      const id = genId()
      resultId = id
      return {
        tabs: [
          ...state.tabs,
          { kind: "chat", id, conversationId: null, title: "新会话" },
        ],
        activeTabId: id,
      }
    })
    return resultId
  },

  closeTab: (tabId) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId)
      if (idx < 0) return state
      const nextActive = pickNextActive(state.tabs, idx, state.activeTabId)
      return {
        tabs: state.tabs.filter((_, i) => i !== idx),
        activeTabId: nextActive,
      }
    })
  },

  activateTab: (tabId) => {
    set((state) => {
      if (!state.tabs.some((t) => t.id === tabId)) return state
      if (state.activeTabId === tabId) return state
      return { activeTabId: tabId }
    })
  },

  updateTitle: (tabId, title) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
    }))
  },

  bindConversation: (tabId, conversationId) => {
    set((state) => {
      const current = state.tabs.find((t) => t.id === tabId)
      if (!current || current.kind !== "chat") return state
      // 若已存在另一个绑定同 convId 的 chat tab,合并:激活那个,关闭当前
      const dup = state.tabs.find(
        (t) =>
          t.kind === "chat" &&
          t.id !== tabId &&
          t.conversationId === conversationId,
      )
      if (dup) {
        return {
          tabs: state.tabs.filter((t) => t.id !== tabId),
          activeTabId: dup.id,
        }
      }
      return {
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "chat"
            ? { ...t, conversationId }
            : t,
        ),
      }
    })
  },

  onConversationDeleted: (conversationId) => {
    set((state) => {
      let changed = false
      const nextTabs = state.tabs.map((t) => {
        if (t.kind === "chat" && t.conversationId === conversationId) {
          changed = true
          return { ...t, conversationId: null, title: "新会话" }
        }
        return t
      })
      return changed ? { tabs: nextTabs } : state
    })
  },
    }),
    {
      name: "prompttool-tabs",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // 只持久化必要字段;过滤掉尚未绑定 conversationId 的临时 chat tab,
      // 以及带 dirty 状态的未保存 file/template tab(内容未落库,恢复无意义)。
      partialize: (state) => {
        const persistedTabs = state.tabs.filter((t) => {
          if (t.kind === "chat") return t.conversationId !== null
          if (t.kind === "template") return t.templateId !== null
          if (t.kind === "file") return !t.dirty
          return true
        })
        const activeStillExists = persistedTabs.some(
          (t) => t.id === state.activeTabId,
        )
        return {
          tabs: persistedTabs,
          activeTabId: activeStillExists
            ? state.activeTabId
            : persistedTabs[persistedTabs.length - 1]?.id ?? null,
        }
      },
    },
  ),
)