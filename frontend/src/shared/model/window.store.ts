import { Events } from "@wailsio/runtime"
import { create } from "zustand"

import { WindowService } from "@/../bindings/prompttool/internal/services"

/**
 * WindowStore 管理主窗口的用户设置状态(目前:置顶)。
 * - alwaysOnTop:是否置顶
 * - initialized:是否已从后端加载过一次初始状态
 * - loading:切换操作进行中,用于按钮防抖
 */
export interface WindowStore {
  alwaysOnTop: boolean
  initialized: boolean
  loading: boolean

  /** 从后端读取当前状态(应用启动或组件挂载时调用一次)。 */
  bootstrap: () => Promise<void>
  /** 切换置顶状态,失败时保留原状态。 */
  toggleAlwaysOnTop: () => Promise<void>
  /** 内部:由事件订阅调用,不触发后端写入。 */
  _setFromEvent: (enabled: boolean) => void
}

const WINDOW_EVENT_ALWAYS_ON_TOP_CHANGED = "window:alwaysOnTop:changed"

export const useWindowStore = create<WindowStore>((set, get) => ({
  alwaysOnTop: false,
  initialized: false,
  loading: false,

  bootstrap: async () => {
    if (get().initialized) return
    try {
      const state = await WindowService.GetAlwaysOnTop()
      set({
        alwaysOnTop: !!state?.enabled,
        initialized: true,
      })
    } catch (err) {
      console.error("[window] bootstrap failed", err)
      set({ initialized: true })
    }
  },

  toggleAlwaysOnTop: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const state = await WindowService.ToggleAlwaysOnTop()
      set({ alwaysOnTop: !!state?.enabled, loading: false })
    } catch (err) {
      console.error("[window] toggle always-on-top failed", err)
      set({ loading: false })
    }
  },

  _setFromEvent: (enabled: boolean) => {
    set({ alwaysOnTop: enabled, initialized: true })
  },
}))

/**
 * 订阅后端置顶状态变更事件。调用一次即可(通常在应用根部)。
 * 返回取消订阅函数。
 */
export function subscribeWindowEvents(): () => void {
  return Events.On(WINDOW_EVENT_ALWAYS_ON_TOP_CHANGED, (evt) => {
    const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
    if (!payload) return
    const enabled = !!(payload as { enabled?: boolean }).enabled
    useWindowStore.getState()._setFromEvent(enabled)
  })
}