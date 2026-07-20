import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/**
 * Tab 元信息。
 *
 * 会话(chat)不再作为 tab —— 会话由右侧固定 ChatPanel 承载,主编辑区
 * 只放"文档类"内容:文件与模板。切换会话通过 ChatPanel 顶栏的历史 Popover。
 */
export type Tab =
  | {
      kind: "file"
      id: string
      path: string
      title: string
      dirty?: boolean
      pinned?: boolean
      preview?: boolean
      invalid?: boolean
    }
  | {
      kind: "template"
      id: string
      templateId: number | null
      title: string
      dirty?: boolean
      pinned?: boolean
    }

export type TabKind = Tab["kind"]

export interface TabStore {
  tabs: Tab[]
  activeTabId: string | null

  openTemplateTab: (templateId: number | null, title?: string) => string
  openNewTemplateTab: () => string
  bindTemplate: (tabId: string, templateId: number) => void
  onTemplateDeleted: (templateId: number) => void

  openFile: (path: string, title?: string) => string
  openFilePreview: (path: string, title?: string) => string
  promoteToPermanent: (tabId: string) => void
  setDirty: (tabId: string, dirty: boolean) => void
  updateFilePath: (oldPath: string, newPath: string, newTitle?: string) => void
  markFilePathInvalid: (path: string, invalid?: boolean) => void
  togglePin: (tabId: string) => void

  closeTab: (tabId: string) => void
  closeOthers: (tabId: string) => void
  closeToRight: (tabId: string) => void
  closeAll: () => void

  activateTab: (tabId: string) => void
  updateTitle: (tabId: string, title: string) => void

  reorderTab: (sourceId: string, targetId: string, before: boolean) => void

  activateRelative: (offset: number) => void
  activateByIndex: (index: number) => void
}

const genId = () =>
  `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

function findTemplateTabById(tabs: Tab[], tplId: number): Tab | undefined {
  return tabs.find((t) => t.kind === "template" && t.templateId === tplId)
}

function findFileTabByPath(tabs: Tab[], path: string): Tab | undefined {
  return tabs.find((t) => t.kind === "file" && t.path === path)
}

function findPreviewFileTab(tabs: Tab[]): Tab | undefined {
  return tabs.find((t) => t.kind === "file" && t.preview === true)
}

function baseNameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"))
  return idx >= 0 ? p.slice(idx + 1) : p
}

function pickNextActive(
  tabs: Tab[],
  closedIndex: number,
  activeTabId: string | null,
): string | null {
  if (tabs.length === 0) return null
  const closedTab = tabs[closedIndex]
  if (activeTabId !== closedTab.id) return activeTabId
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
          const preview = findPreviewFileTab(state.tabs)
          if (preview && preview.kind === "file") {
            resultId = preview.id
            return {
              tabs: state.tabs.map((t) =>
                t.id === preview.id && t.kind === "file"
                  ? {
                      ...t,
                      path,
                      title: finalTitle,
                      preview: false,
                      dirty: false,
                      invalid: false,
                    }
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
          const existing = findFileTabByPath(state.tabs, path)
          if (existing && existing.kind === "file") {
            resultId = existing.id
            return { activeTabId: existing.id }
          }
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

      reorderTab: (sourceId, targetId, before) => {
        set((state) => {
          if (sourceId === targetId) return state
          const src = state.tabs.find((t) => t.id === sourceId)
          const dst = state.tabs.find((t) => t.id === targetId)
          if (!src || !dst) return state
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
      version: 2,
      migrate: (persisted: unknown, version) => {
        // v1 → v2:剔除 kind === "chat" 的旧 tab
        if (version < 2 && persisted && typeof persisted === "object") {
          const rec = persisted as { tabs?: Tab[]; activeTabId?: string | null }
          const tabs = (rec.tabs || []).filter(
            (t) => t.kind === "file" || t.kind === "template",
          )
          const activeStillExists = tabs.some((t) => t.id === rec.activeTabId)
          return {
            tabs,
            activeTabId: activeStillExists
              ? rec.activeTabId ?? null
              : tabs[tabs.length - 1]?.id ?? null,
          }
        }
        return persisted as { tabs: Tab[]; activeTabId: string | null }
      },
      partialize: (state) => {
        const persistedTabs = state.tabs.filter((t) => {
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