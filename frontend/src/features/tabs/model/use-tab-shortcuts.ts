import { useEffect } from "react"

import { useTabStore } from "./tab.store"

import { requestCloseTab } from "./close-coordinator"

/**
 * 全局 tab 快捷键:
 *   Ctrl/Cmd + W               关闭当前 tab(dirty 走确认流)
 *   Ctrl/Cmd + Tab             激活下一个 tab
 *   Ctrl/Cmd + Shift + Tab     激活上一个 tab
 *   Ctrl/Cmd + PageDown/PageUp 同上(编辑器习惯)
 *   Ctrl/Cmd + 1..8            激活第 N 个 tab
 *   Ctrl/Cmd + 9               激活最后一个 tab
 *
 * 输入框内忽略数字键快捷,避免影响录入;Ctrl+W / Ctrl+Tab 不忽略,
 * 因为它们即使在输入框内也是编辑器通用行为。
 */
export function useTabShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      // Ctrl+Tab / Ctrl+Shift+Tab
      if (e.key === "Tab") {
        e.preventDefault()
        useTabStore.getState().activateRelative(e.shiftKey ? -1 : 1)
        return
      }
      // Ctrl+PageDown / Ctrl+PageUp
      if (e.key === "PageDown") {
        e.preventDefault()
        useTabStore.getState().activateRelative(1)
        return
      }
      if (e.key === "PageUp") {
        e.preventDefault()
        useTabStore.getState().activateRelative(-1)
        return
      }
      // Ctrl+W
      if (e.key.toLowerCase() === "w" && !e.shiftKey && !e.altKey) {
        const active = useTabStore.getState().activeTabId
        if (!active) return
        e.preventDefault()
        void requestCloseTab(active)
        return
      }
      // Ctrl+1..9(需要主键盘或小键盘的数字键)
      if (/^[1-9]$/.test(e.key)) {
        // 输入框内忽略数字快捷键,避免打断填写
        const target = e.target as HTMLElement | null
        if (target) {
          const tag = target.tagName
          if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            target.isContentEditable
          ) {
            return
          }
        }
        e.preventDefault()
        const n = parseInt(e.key, 10)
        if (n === 9) {
          useTabStore.getState().activateByIndex(-1)
        } else {
          useTabStore.getState().activateByIndex(n - 1)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}