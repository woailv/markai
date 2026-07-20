import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { CHAT_PANEL_LAYOUT } from "@/shared/config"

/**
 * 右侧 ChatPanel 的布局状态。
 *
 * 与 Zed / Cursor 的右侧 AI 面板一致:
 * - 固定在窗口右侧,宽度可拖拽调整
 * - 支持折叠(整个面板收起,仅保留主编辑区)
 *
 * 历史/模板的切换不再放在这里,已下沉到 ChatPanel 顶栏的 Popover。
 * 面板宽度常量已下沉到 shared/config/layout.ts。
 */

export interface RightPanelStore {
  /** 面板是否折叠(true = 隐藏 ChatPanel) */
  collapsed: boolean
  /** 展开态的像素宽度 */
  width: number

  setCollapsed: (v: boolean) => void
  toggleCollapsed: () => void
  setWidth: (w: number) => void
}

// 兼容旧签名:index.ts 里仍导出 RightPanelKind 类型,
// 保留一个宽松的字符串联合以便暂未清理的调用点通过 TS 校验;
// 实际逻辑已迁移到 collapsed / width。
export type RightPanelKind = "history" | "template"

export const useRightPanelStore = create<RightPanelStore>()(
  persist(
    (set, get) => ({
      collapsed: false,
      width: CHAT_PANEL_LAYOUT.DEFAULT_WIDTH,

      setCollapsed: (v) => {
        if (get().collapsed === v) return
        set({ collapsed: v })
      },
      toggleCollapsed: () => set({ collapsed: !get().collapsed }),
      setWidth: (w) => {
        const clamped = Math.max(
          CHAT_PANEL_LAYOUT.MIN_WIDTH,
          Math.min(CHAT_PANEL_LAYOUT.MAX_WIDTH, Math.round(w)),
        )
        if (get().width === clamped) return
        set({ width: clamped })
      },
    }),
    {
      name: "prompttool-right-panel",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted: unknown, version) => {
        // v1 → v2:清理旧的 panel 字段
        if (version < 2 && persisted && typeof persisted === "object") {
          const rec = persisted as Record<string, unknown>
          return {
            collapsed: false,
            width:
              typeof rec.width === "number"
                ? rec.width
                : CHAT_PANEL_LAYOUT.DEFAULT_WIDTH,
          }
        }
        return persisted as RightPanelStore
      },
    },
  ),
)