import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { EDITOR_LAYOUT } from "@/shared/config"

/**
 * 中间编辑区(Tab 编辑区)的持久化宽度。
 *
 * 之所以独立成一个 store,而不放到 tabs 或 right-panel:
 * - 编辑区宽度与"是否有 tab 打开"解耦,需要跨 hasTabs 生命周期保留;
 * - 允许"上次关闭所有文件前的编辑区宽度"在下一次打开文件时恢复,
 *   保持三栏视觉稳定,避免会话区反复跳动。
 */
export interface LayoutStore {
  /** 中间编辑区宽度 (px) */
  editorWidth: number
  setEditorWidth: (w: number) => void
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      editorWidth: EDITOR_LAYOUT.DEFAULT_WIDTH,
      setEditorWidth: (w) => {
        const px = Math.max(EDITOR_LAYOUT.MIN_WIDTH, Math.round(w))
        if (get().editorWidth === px) return
        set({ editorWidth: px })
      },
    }),
    {
      name: "prompttool-layout",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
