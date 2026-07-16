import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * 输入框相关的用户偏好设置。
 * 通过 localStorage 持久化,跨会话保留。
 */
interface ComposeSettingsState {
  /** 发送后是否自动将消息内容复制到剪贴板 */
  copyAfterSend: boolean
  setCopyAfterSend: (v: boolean) => void
  toggleCopyAfterSend: () => void
}

export const useComposeSettingsStore = create<ComposeSettingsState>()(
  persist(
    (set, get) => ({
      copyAfterSend: false,
      setCopyAfterSend: (v) => set({ copyAfterSend: v }),
      toggleCopyAfterSend: () => set({ copyAfterSend: !get().copyAfterSend }),
    }),
    {
      name: "compose-settings",
    },
  ),
)