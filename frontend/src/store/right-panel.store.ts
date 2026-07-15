import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

/**
 * 主页右侧面板的互斥切换。
 *
 * 与 Zed 一致:同一位置最多渲染一个面板,再次点击同一按钮 → 关闭。
 * 使用可判别 union 表达状态,避免多个布尔开关之间语义漂移。
 */
export type RightPanelKind = "history" | "template"

export interface RightPanelStore {
  panel: RightPanelKind | null
  /** 点击某个面板按钮:若当前就是它则关闭,否则切到它。 */
  toggle: (kind: RightPanelKind) => void
  /** 强制显示某个面板(用于代码流程,如"从模板打开标签"后不希望改变现有状态)。 */
  show: (kind: RightPanelKind) => void
  close: () => void
}

export const useRightPanelStore = create<RightPanelStore>()(
  persist(
    (set) => ({
      panel: "history",
      toggle: (kind) =>
        set((state) => ({ panel: state.panel === kind ? null : kind })),
      show: (kind) => set({ panel: kind }),
      close: () => set({ panel: null }),
    }),
    {
      name: "prompttool-right-panel",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)