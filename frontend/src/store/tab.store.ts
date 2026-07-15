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
      /** true 表示预览 tab(斜体标题,可被下一次单击复用) */
      preview?: boolean
      /** true 表示路径已失效(文件被删除或不可访问),UI 上加警告图标 */
      invalid?: boolean
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

  /** 打开(或激活已存在的)模板 tab。templateId=null 表示未落库的新模板 tab。 */
  openTemplateTab: (templateId: number | null, title?: string) => string
  /** 显式打开一个空的新模板 tab(复用已存在的未绑定 tab,避免重复)。 */
  openNewTemplateTab: () => string
  /**
   * 将一个未绑定 templateId 的模板 tab 绑定到真实的 templateId。
   * 若目标 templateId 已被其他模板 tab 占用,会合并到那个 tab 并关闭当前 tab。
   */
  bindTemplate: (tabId: string, templateId: number) => void
  /** 当模板在别处被删除时,清理相关 tab。 */
  onTemplateDeleted: (templateId: number) => void

  /**
   * 打开文件为正式 tab。若该路径已有 tab(无论预览/正式),激活并升级为正式。
   * 若当前存在预览 tab 且该预览 tab 未被显式固化,则复用预览 tab 的槽位。
   */
  openFile: (path: string, title?: string) => string
  /**
   * 单击目录树时的"预览"模式:复用同一个预览 tab 位,只更新 path/title。
   * 若目标路径已有正式 tab,直接激活它,不新增预览。
   */
  openFilePreview: (path: string, title?: string) => string
  /** 将预览 tab 固化为正式 tab(双击预览 tab 或修改内容时调用)。 */
  promoteToPermanent: (tabId: string) => void
  /** 设置 file/template tab 的 dirty 状态。 */
  setDirty: (tabId: string, dirty: boolean) => void
  /**
   * 文件重命名/移动后同步 tab 状态。若新路径已被其他 file tab 占用,合并并关闭当前。
   */
  updateFilePath: (oldPath: string, newPath: string, newTitle?: string) => void
  /**
   * 目录被删除或路径失效时,批量标记为失效状态。
   * 不直接删除 tab,以便用户看到警告并手动处理。
   */
  markFilePathInvalid: (path: string, invalid?: boolean) => void
  /** 固定/取消固定 tab。 */
  togglePin: (tabId: string) => void

  /** 关闭 tab。若关闭的是激活 tab,自动激活相邻 tab。 */
  closeTab: (tabId: string) => void
  /** 关闭除 tabId 外的其他所有非固定 tab。 */
  closeOthers: (tabId: string) => void
  /** 关闭 tabId 右侧的所有非固定 tab。 */
  closeToRight: (tabId: string) => void
  /** 关闭所有非固定 tab。 */
  closeAll: () => void

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

  /**
   * 拖拽重排:把 sourceId 移到 targetId 之前(before=true)或之后(before=false)。
   * pinned/unpinned 分区独立:不能把非固定 tab 拖到固定区,反之亦然。
   */
  reorderTab: (sourceId: string, targetId: string, before: boolean) => void

  /** 激活相对当前 activeTab 的偏移 tab(Ctrl+Tab / Ctrl+Shift+Tab)。 */
  activateRelative: (offset: number) => void
  /** 激活序号第 index 个 tab(1-based,Ctrl+1..8);Ctrl+9 => 最后一个,传 -1。 */
  activateByIndex: (index: number) => void
}

const genId = () =>
  `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

/** 找出 conversationId 已绑定的 chat tab id(如果存在)。 */
function findChatTabByConvId(tabs: Tab[], convId: number): Tab | undefined {
  return tabs.find(
    (t) => t.kind === "chat" && t.conversationId === convId,
  )
}

/** 找出 templateId 已绑定的 template tab(如果存在)。 */
function findTemplateTabById(tabs: Tab[], tplId: number): Tab | undefined {
  return tabs.find((t) => t.kind === "template" && t.templateId === tplId)
}

/** 找到指定路径的 file tab(不区分 preview/正式)。 */
function findFileTabByPath(tabs: Tab[], path: string): Tab | undefined {
  return tabs.find((t) => t.kind === "file" && t.path === path)
}

/** 找到当前预览 file tab(至多一个)。 */
function findPreviewFileTab(tabs: Tab[]): Tab | undefined {
  return tabs.find((t) => t.kind === "file" && t.preview === true)
}

/** 从路径中提取文件名作为默认标题。 */
function baseNameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"))
  return idx >= 0 ? p.slice(idx + 1) : p
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

  openTemplateTab: (templateId, title = "新模板") => {
    let resultId = ""
    set((state) => {
      if (templateId !== null) {
        const existing = findTemplateTabById(state.tabs, templateId)
        if (existing) {
          resultId = existing.id
          return state.activeTabId === existing.id
            ? state
            : { activeTabId: existing.id }
        }
      }
      const id = genId()
      resultId = id
      const newTab: Tab = {
        kind: "template",
        id,
        templateId,
        title,
      }
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: id,
      }
    })
    return resultId
  },

  openNewTemplateTab: () => {
    let resultId = ""
    set((state) => {
      const existingNew = state.tabs.find(
        (t) => t.kind === "template" && t.templateId === null,
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
          { kind: "template", id, templateId: null, title: "新模板" },
        ],
        activeTabId: id,
      }
    })
    return resultId
  },

  bindTemplate: (tabId, templateId) => {
    set((state) => {
      const current = state.tabs.find((t) => t.id === tabId)
      if (!current || current.kind !== "template") return state
      const dup = state.tabs.find(
        (t) =>
          t.kind === "template" &&
          t.id !== tabId &&
          t.templateId === templateId,
      )
      if (dup) {
        return {
          tabs: state.tabs.filter((t) => t.id !== tabId),
          activeTabId: dup.id,
        }
      }
      return {
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "template"
            ? { ...t, templateId }
            : t,
        ),
      }
    })
  },

  onTemplateDeleted: (templateId) => {
    set((state) => {
      let changed = false
      const nextTabs = state.tabs.map((t) => {
        if (t.kind === "template" && t.templateId === templateId) {
          changed = true
          return { ...t, templateId: null, title: "新模板", dirty: false }
        }
        return t
      })
      return changed ? { tabs: nextTabs } : state
    })
  },

  openFile: (path, title) => {
    let resultId = ""
    set((state) => {
      const finalTitle = title ?? baseNameOf(path)
      // 已存在 → 激活并升级为正式
      const existing = findFileTabByPath(state.tabs, path)
      if (existing && existing.kind === "file") {
        resultId = existing.id
        return {
          tabs: state.tabs.map((t) =>
            t.id === existing.id && t.kind === "file"
              ? { ...t, preview: false, title: finalTitle }
              : t,
          ),
          activeTabId: existing.id,
        }
      }
      // 复用预览槽(若有)
      const preview = findPreviewFileTab(state.tabs)
      if (preview && preview.kind === "file") {
        resultId = preview.id
        return {
          tabs: state.tabs.map((t) =>
            t.id === preview.id && t.kind === "file"
              ? { ...t, path, title: finalTitle, preview: false, dirty: false, invalid: false }
              : t,
          ),
          activeTabId: preview.id,
        }
      }
      const id = genId()
      resultId = id
      const newTab: Tab = {
        kind: "file",
        id,
        path,
        title: finalTitle,
      }
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: id,
      }
    })
    return resultId
  },

  openFilePreview: (path, title) => {
    let resultId = ""
    set((state) => {
      const finalTitle = title ?? baseNameOf(path)
      // 已有正式 tab → 直接激活,不动预览状态
      const existing = findFileTabByPath(state.tabs, path)
      if (existing && existing.kind === "file") {
        resultId = existing.id
        return { activeTabId: existing.id }
      }
      // 复用现有预览槽
      const preview = findPreviewFileTab(state.tabs)
      if (preview && preview.kind === "file") {
        resultId = preview.id
        return {
          tabs: state.tabs.map((t) =>
            t.id === preview.id && t.kind === "file"
              ? { ...t, path, title: finalTitle, dirty: false, invalid: false }
              : t,
          ),
          activeTabId: preview.id,
        }
      }
      const id = genId()
      resultId = id
      const newTab: Tab = {
        kind: "file",
        id,
        path,
        title: finalTitle,
        preview: true,
      }
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: id,
      }
    })
    return resultId
  },

  promoteToPermanent: (tabId) => {
    set((state) => {
      const t = state.tabs.find((x) => x.id === tabId)
      if (!t || t.kind !== "file" || !t.preview) return state
      return {
        tabs: state.tabs.map((x) =>
          x.id === tabId && x.kind === "file" ? { ...x, preview: false } : x,
        ),
      }
    })
  },

  setDirty: (tabId, dirty) => {
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        if (t.kind === "file") {
          // 变脏时自动固化预览
          const next: Tab = { ...t, dirty, preview: dirty ? false : t.preview }
          return next
        }
        if (t.kind === "template") return { ...t, dirty }
        return t
      }),
    }))
  },

  updateFilePath: (oldPath, newPath, newTitle) => {
    set((state) => {
      const cur = state.tabs.find(
        (t) => t.kind === "file" && t.path === oldPath,
      )
      if (!cur || cur.kind !== "file") return state
      const dup = state.tabs.find(
        (t) => t.kind === "file" && t.id !== cur.id && t.path === newPath,
      )
      const title = newTitle ?? baseNameOf(newPath)
      if (dup && dup.kind === "file") {
        // 合并:激活 dup,关闭 cur
        return {
          tabs: state.tabs.filter((t) => t.id !== cur.id),
          activeTabId:
            state.activeTabId === cur.id ? dup.id : state.activeTabId,
        }
      }
      return {
        tabs: state.tabs.map((t) =>
          t.id === cur.id && t.kind === "file"
            ? { ...t, path: newPath, title, invalid: false }
            : t,
        ),
      }
    })
  },

  markFilePathInvalid: (path, invalid = true) => {
    set((state) => {
      let changed = false
      const nextTabs = state.tabs.map((t) => {
        if (t.kind === "file" && t.path === path && !!t.invalid !== invalid) {
          changed = true
          return { ...t, invalid }
        }
        return t
      })
      return changed ? { tabs: nextTabs } : state
    })
  },

  togglePin: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, pinned: !t.pinned } : t,
      ),
    }))
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

  closeOthers: (tabId) => {
    set((state) => {
      const keep = state.tabs.filter((t) => t.id === tabId || t.pinned)
      const activeStillExists = keep.some((t) => t.id === state.activeTabId)
      return {
        tabs: keep,
        activeTabId: activeStillExists ? state.activeTabId : tabId,
      }
    })
  },

  closeToRight: (tabId) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId)
      if (idx < 0) return state
      const keep = state.tabs.filter((t, i) => i <= idx || t.pinned)
      const activeStillExists = keep.some((t) => t.id === state.activeTabId)
      return {
        tabs: keep,
        activeTabId: activeStillExists ? state.activeTabId : tabId,
      }
    })
  },

  closeAll: () => {
    set((state) => {
      const keep = state.tabs.filter((t) => t.pinned)
      const activeStillExists = keep.some((t) => t.id === state.activeTabId)
      return {
        tabs: keep,
        activeTabId: activeStillExists
          ? state.activeTabId
          : keep[keep.length - 1]?.id ?? null,
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

  reorderTab: (sourceId, targetId, before) => {
    set((state) => {
      if (sourceId === targetId) return state
      const src = state.tabs.find((t) => t.id === sourceId)
      const dst = state.tabs.find((t) => t.id === targetId)
      if (!src || !dst) return state
      // pinned 与非 pinned 属于两个区,不允许跨区拖拽(避免语义混乱)
      if (!!src.pinned !== !!dst.pinned) return state
      const without = state.tabs.filter((t) => t.id !== sourceId)
      const dstIdx = without.findIndex((t) => t.id === targetId)
      if (dstIdx < 0) return state
      const insertAt = before ? dstIdx : dstIdx + 1
      const next = [...without.slice(0, insertAt), src, ...without.slice(insertAt)]
      return { tabs: next }
    })
  },

  activateRelative: (offset) => {
    set((state) => {
      if (state.tabs.length === 0) return state
      const curIdx = state.tabs.findIndex((t) => t.id === state.activeTabId)
      const base = curIdx < 0 ? 0 : curIdx
      const n = state.tabs.length
      const nextIdx = ((base + offset) % n + n) % n
      const nextId = state.tabs[nextIdx].id
      return nextId === state.activeTabId ? state : { activeTabId: nextId }
    })
  },

  activateByIndex: (index) => {
    set((state) => {
      if (state.tabs.length === 0) return state
      // -1 表示最后一个(Ctrl+9)
      const idx = index === -1 ? state.tabs.length - 1 : index
      if (idx < 0 || idx >= state.tabs.length) return state
      const nextId = state.tabs[idx].id
      return nextId === state.activeTabId ? state : { activeTabId: nextId }
    })
  },
    }),
    {
      name: "prompttool-tabs",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // 只持久化必要字段;过滤掉尚未绑定 conversationId 的临时 chat tab、
      // 预览态 file tab(用户尚未固化,恢复无意义),以及带 dirty 状态的未保存 tab。
      partialize: (state) => {
        const persistedTabs = state.tabs.filter((t) => {
          if (t.kind === "chat") return t.conversationId !== null
          if (t.kind === "template") return t.templateId !== null
          if (t.kind === "file") return !t.dirty && !t.preview
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