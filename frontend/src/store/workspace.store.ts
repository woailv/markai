import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { WorkspaceEntry } from "@/../bindings/prompttool/internal/services/models"

/**
 * TreeNode 前端扁平化的节点表示。
 * 使用 childrenPaths 保存有序的子节点绝对路径,
 * 真正的节点数据统一存在 nodes Map 里,便于 O(1) 定位与局部更新。
 */
export interface TreeNode {
  entry: WorkspaceEntry
  /** 已加载过一次子项 */
  loaded: boolean
  /** 正在拉取子项 */
  loading: boolean
  /** 有序子节点绝对路径列表(目录在前、名称升序) */
  childrenPaths: string[]
  /** 拉取子项时的错误信息 */
  error?: string
}

interface WorkspaceState {
  /** 根目录绝对路径,空表示未设置 */
  root: string
  /** 根目录一层的有序子路径 */
  rootChildren: string[]
  /** 扁平节点表:key = 绝对路径 */
  nodes: Record<string, TreeNode>
  /** 展开的目录路径集合 */
  expanded: Set<string>
  /** 当前选中的路径(单选,主要用于键盘/单击场景) */
  selectedPath: string | null
  /** 多选路径集合(Ctrl/Shift 点击) */
  selectedPaths: Set<string>
  /** 多选锚点,用于 Shift 范围选择 */
  anchorPath: string | null
  /** 是否显示隐藏文件(点开头/系统隐藏属性) */
  showHidden: boolean
  /** 搜索关键字(小写) */
  searchQuery: string
  /** 面板是否折叠(收起后仅显示一个窄条) */
  collapsed: boolean
  /** 面板宽度 (px) */
  width: number
  /** 后端监听状态(实时/降级/失败) */
  watchStatus: "idle" | "watching" | "degraded" | "error"
  /** 状态说明,渲染在 UI 上 */
  watchReason?: string

  // ---- actions ----
  setRoot: (root: string) => void
  setRootChildren: (paths: string[]) => void
  upsertNodes: (entries: WorkspaceEntry[]) => void
  setChildren: (parentPath: string, childrenPaths: string[]) => void
  setNodeLoading: (path: string, loading: boolean, error?: string) => void
  removeSubtree: (path: string) => void
  toggleExpanded: (path: string) => void
  setExpanded: (path: string, expanded: boolean) => void
  expandAncestors: (path: string) => void
  setSelected: (path: string | null) => void
  /** 单选:清空多选并将 path 作为唯一选中项(anchor) */
  selectOnly: (path: string | null) => void
  /** Ctrl/Cmd 点击:切换 path 的选中态,更新 anchor */
  toggleSelect: (path: string) => void
  /** Shift 点击:从 anchor 到 path 的可见范围内追加选中 */
  rangeSelect: (path: string, visibleOrder: string[]) => void
  /** 清空多选 */
  clearSelection: () => void
  setShowHidden: (v: boolean) => void
  setSearchQuery: (q: string) => void
  setCollapsed: (v: boolean) => void
  setWidth: (w: number) => void
  setWatchStatus: (status: WorkspaceState["watchStatus"], reason?: string) => void
  reset: () => void
}

const MIN_WIDTH = 200
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 280

/** 目录在前、名称字典序升序 */
export function sortEntries(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  })
}

/**
 * 用于持久化的最小切片:折叠状态、宽度、隐藏文件开关、根目录。
 * 其余瞬时状态(nodes/expanded/searchQuery/…)不落库。
 */
interface PersistedSlice {
  collapsed: boolean
  width: number
  showHidden: boolean
  root: string
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      root: "",
      rootChildren: [],
      nodes: {},
      expanded: new Set<string>(),
      selectedPath: null,
      selectedPaths: new Set<string>(),
      anchorPath: null,
      showHidden: false,
      searchQuery: "",
      collapsed: false,
      width: DEFAULT_WIDTH,
      watchStatus: "idle",
      watchReason: undefined,

      setRoot: (root) => {
        // 幂等保护:根目录未变化时,不清空 expanded / nodes / 选中态。
        // 折叠工作区面板后重新挂载时,useWorkspaceEvents 会以持久化的 root
        // 再次调用 SetRoot,若无此保护,已展开的多级目录会全部被折叠。
        const current = get().root
        if (current === root) {
          if (!current) set({ root })
          return
        }
        set({
          root,
          rootChildren: [],
          nodes: {},
          expanded: new Set(),
          selectedPath: null,
          selectedPaths: new Set(),
          anchorPath: null,
        })
      },

      setRootChildren: (paths) => set({ rootChildren: paths }),

      upsertNodes: (entries) => {
        if (entries.length === 0) return
        const nodes = { ...get().nodes }
        for (const entry of entries) {
          const existing = nodes[entry.path]
          if (existing) {
            // 保留 loaded/loading/childrenPaths,仅更新元数据
            nodes[entry.path] = { ...existing, entry }
          } else {
            nodes[entry.path] = {
              entry,
              loaded: false,
              loading: false,
              childrenPaths: [],
            }
          }
        }
        set({ nodes })
      },

      setChildren: (parentPath, childrenPaths) => {
        const nodes = { ...get().nodes }
        const parent = nodes[parentPath]
        if (parent) {
          nodes[parentPath] = {
            ...parent,
            childrenPaths,
            loaded: true,
            loading: false,
            error: undefined,
          }
          set({ nodes })
        }
      },

      setNodeLoading: (path, loading, error) => {
        const nodes = { ...get().nodes }
        const node = nodes[path]
        if (node) {
          nodes[path] = { ...node, loading, error }
          set({ nodes })
        }
      },

      removeSubtree: (path) => {
        const { nodes, expanded, rootChildren, root, selectedPath, selectedPaths, anchorPath } =
          get()
        const nextNodes = { ...nodes }
        const nextExpanded = new Set(expanded)
        const nextSelectedPaths = new Set(selectedPaths)
        let nextAnchor = anchorPath

        // 递归收集 path 及其后代
        const stack = [path]
        while (stack.length > 0) {
          const cur = stack.pop() as string
          const node = nextNodes[cur]
          if (!node) continue
          for (const child of node.childrenPaths) stack.push(child)
          delete nextNodes[cur]
          nextExpanded.delete(cur)
          nextSelectedPaths.delete(cur)
          if (nextAnchor === cur) nextAnchor = null
        }

        // 从父节点或根子表中摘掉
        let nextRootChildren = rootChildren
        if (rootChildren.includes(path)) {
          nextRootChildren = rootChildren.filter((p) => p !== path)
        } else {
          for (const key of Object.keys(nextNodes)) {
            const node = nextNodes[key]
            if (node.childrenPaths.includes(path)) {
              nextNodes[key] = {
                ...node,
                childrenPaths: node.childrenPaths.filter((p) => p !== path),
              }
            }
          }
        }

        set({
          nodes: nextNodes,
          expanded: nextExpanded,
          rootChildren: nextRootChildren,
          selectedPath:
            selectedPath && (selectedPath === path || selectedPath.startsWith(path + "/") || selectedPath.startsWith(path + "\\"))
              ? null
              : selectedPath,
          selectedPaths: nextSelectedPaths,
          anchorPath: nextAnchor,
          // root 保持不变
          root,
        })
      },

      toggleExpanded: (path) => {
        const expanded = new Set(get().expanded)
        if (expanded.has(path)) expanded.delete(path)
        else expanded.add(path)
        set({ expanded })
      },

      setExpanded: (path, isExpanded) => {
        const expanded = new Set(get().expanded)
        if (isExpanded) expanded.add(path)
        else expanded.delete(path)
        set({ expanded })
      },

      expandAncestors: (path) => {
        const { nodes, root } = get()
        const expanded = new Set(get().expanded)
        let cur = nodes[path]?.entry.parent
        while (cur && cur !== root && cur.length > 0) {
          expanded.add(cur)
          const parentNode = nodes[cur]
          if (!parentNode) break
          cur = parentNode.entry.parent
        }
        set({ expanded })
      },

      setSelected: (path) => set({ selectedPath: path }),

      selectOnly: (path) => {
        const next = new Set<string>()
        if (path) next.add(path)
        set({
          selectedPath: path,
          selectedPaths: next,
          anchorPath: path,
        })
      },

      toggleSelect: (path) => {
        const next = new Set(get().selectedPaths)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        // selectedPath 跟随最后一次操作的路径,便于键盘视觉聚焦
        set({
          selectedPaths: next,
          anchorPath: path,
          selectedPath: next.has(path) ? path : get().selectedPath,
        })
      },

      rangeSelect: (path, visibleOrder) => {
        const anchor = get().anchorPath ?? path
        const ai = visibleOrder.indexOf(anchor)
        const bi = visibleOrder.indexOf(path)
        if (ai < 0 || bi < 0) {
          const next = new Set(get().selectedPaths)
          next.add(path)
          set({ selectedPaths: next, selectedPath: path })
          return
        }
        const [lo, hi] = ai <= bi ? [ai, bi] : [bi, ai]
        const next = new Set(get().selectedPaths)
        for (let i = lo; i <= hi; i++) next.add(visibleOrder[i])
        set({ selectedPaths: next, selectedPath: path })
      },

      clearSelection: () =>
        set({ selectedPaths: new Set(), anchorPath: null }),

      setShowHidden: (v) => set({ showHidden: v }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setCollapsed: (v) => set({ collapsed: v }),
      setWidth: (w) =>
        set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) }),
      setWatchStatus: (status, reason) => set({ watchStatus: status, watchReason: reason }),

      reset: () =>
        set({
          rootChildren: [],
          nodes: {},
          expanded: new Set(),
          selectedPath: null,
          selectedPaths: new Set(),
          anchorPath: null,
          searchQuery: "",
        }),
    }),
    {
      name: "prompttool.workspace",
      partialize: (state): PersistedSlice => ({
        collapsed: state.collapsed,
        width: state.width,
        showHidden: state.showHidden,
        root: state.root,
      }),
      // Set 不能被 JSON 序列化;这里只持久化了标量,无需自定义 storage。
    },
  ),
)

export const WORKSPACE_LAYOUT = {
  MIN_WIDTH,
  MAX_WIDTH,
  DEFAULT_WIDTH,
  COLLAPSED_WIDTH: 36,
}