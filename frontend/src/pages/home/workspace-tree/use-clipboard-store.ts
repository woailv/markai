import { create } from "zustand"

/**
 * 应用内文件剪贴板(Ctrl+C / X / V)。
 * 仅在内存中维护,不持久化;窗口刷新即清空。
 *
 * - paths:被拷贝/剪切的绝对路径集合
 * - mode:"copy" | "cut" | null
 * - sourceIsExternal:预留字段,当前始终为 false(占位,便于未来扩展系统剪贴板同步)
 */
export interface ClipboardState {
  paths: string[]
  mode: "copy" | "cut" | null
  sourceIsExternal: boolean

  setInternal: (paths: string[], mode: "copy" | "cut") => void
  clear: () => void
  isEmpty: () => boolean
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  paths: [],
  mode: null,
  sourceIsExternal: false,

  setInternal: (paths, mode) =>
    set({
      paths: Array.from(new Set(paths)).filter((p) => !!p),
      mode,
      sourceIsExternal: false,
    }),

  clear: () => set({ paths: [], mode: null, sourceIsExternal: false }),

  isEmpty: () => get().paths.length === 0,
}))