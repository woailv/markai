import { Events } from "@wailsio/runtime"
import { create } from "zustand"

import { RecentService } from "@/../bindings/prompttool/internal/services/recent"
import type { RecentItem } from "@/../bindings/prompttool/internal/services/recent/models"

/**
 * useRecentStore 管理"最近打开"列表状态。
 * - items:  按 OpenedAt 降序排列的最近条目
 * - loading:首次或手动刷新时的加载状态
 * - error:  最近一次操作的错误信息(可为空)
 *
 * store 初始化时订阅后端 "recent:changed" 事件,变更后自动 load。
 */

const RECENT_EVENT = "recent:changed"

interface RecentState {
  items: RecentItem[]
  loading: boolean
  error?: string
  loaded: boolean
  load: () => Promise<void>
  record: (path: string) => Promise<RecentItem | null>
  remove: (id: number) => Promise<void>
  clear: () => Promise<void>
}

export const useRecentStore = create<RecentState>((set, get) => ({
  items: [],
  loading: false,
  error: undefined,
  loaded: false,

  load: async () => {
    set({ loading: true, error: undefined })
    try {
      const list = await RecentService.List({})
      set({ items: list ?? [], loading: false, loaded: true })
    } catch (err) {
      console.error("[recent] List failed", err)
      set({ loading: false, error: String(err), loaded: true })
    }
  },

  record: async (path: string) => {
    try {
      const item = await RecentService.Record(path)
      // 事件订阅会触发 load;这里同步返回结果供调用方使用
      return item ?? null
    } catch (err) {
      console.error("[recent] Record failed", err)
      set({ error: String(err) })
      return null
    }
  },

  remove: async (id: number) => {
    try {
      await RecentService.Remove({ id })
      // 乐观更新;事件回调也会 load 兜底
      set({ items: get().items.filter((it) => it.id !== id) })
    } catch (err) {
      console.error("[recent] Remove failed", err)
      set({ error: String(err) })
    }
  },

  clear: async () => {
    try {
      await RecentService.Clear({})
      set({ items: [] })
    } catch (err) {
      console.error("[recent] Clear failed", err)
      set({ error: String(err) })
    }
  },
}))

// 订阅后端事件:任何数据变更后重新拉取列表
let subscribed = false
function ensureSubscribed() {
  if (subscribed) return
  subscribed = true
  try {
    Events.On(RECENT_EVENT, () => {
      void useRecentStore.getState().load()
    })
  } catch (err) {
    console.error("[recent] subscribe failed", err)
  }
}
ensureSubscribed()