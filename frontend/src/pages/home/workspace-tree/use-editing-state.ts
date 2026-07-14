import { create } from "zustand"

/**
 * 内联编辑状态。全局单实例是为了让 tree-node、workspace-panel、context-menu
 * 之间无需 props 透传:
 *  - 新建 pending(kind = "create"):父目录路径 + 类型
 *  - 重命名 pending(kind = "rename"):目标路径
 */
export type EditingState =
  | {
      kind: "create"
      parentPath: string
      isDir: boolean
    }
  | {
      kind: "rename"
      path: string
    }
  | null

interface EditingStore {
  editing: EditingState
  startCreate: (parentPath: string, isDir: boolean) => void
  startRename: (path: string) => void
  clear: () => void
}

export const useEditingStore = create<EditingStore>((set) => ({
  editing: null,
  startCreate: (parentPath, isDir) =>
    set({ editing: { kind: "create", parentPath, isDir } }),
  startRename: (path) => set({ editing: { kind: "rename", path } }),
  clear: () => set({ editing: null }),
}))