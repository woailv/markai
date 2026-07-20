import { FileService } from "@/../bindings/prompttool/internal/services"

import { useWorkspaceStore } from "./workspace.store"

import { toast } from "../ui/toast"
import {
  refreshDirectoryChildren,
  refreshRoot,
} from "./use-workspace-events"

/** 非法字符集合,与后端保持一致(Windows 严格集)。 */
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/

export interface NameValidation {
  ok: boolean
  reason?: string
}

/**
 * 校验候选名称:非空、不含非法字符、同级不重名。
 * @param name 待校验的纯文件名(不含分隔符)
 * @param siblings 同级已有名称(小写化后比较)
 * @param originalName 若为重命名,允许保留原名
 */
export function validateName(
  name: string,
  siblings: string[],
  originalName?: string,
): NameValidation {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: "名称不能为空" }
  if (INVALID_NAME_CHARS.test(trimmed)) {
    return { ok: false, reason: `名称不能包含 \\ / : * ? " < > |` }
  }
  if (trimmed === "." || trimmed === "..") {
    return { ok: false, reason: "非法名称" }
  }
  const lower = trimmed.toLowerCase()
  if (originalName && originalName.toLowerCase() === lower) {
    return { ok: true }
  }
  if (siblings.some((s) => s.toLowerCase() === lower)) {
    return { ok: false, reason: "同级已存在同名条目" }
  }
  return { ok: true }
}

/**
 * 根据目标节点确定"新建位置":
 * - 若目标为目录:在其内部创建(并确保其展开);
 * - 若目标为文件:在其父目录中创建;
 * - 若无目标:根目录。
 * 返回父目录绝对路径。
 */
export function resolveCreationParent(targetPath: string | null): string {
  const state = useWorkspaceStore.getState()
  if (!targetPath) return state.root
  const node = state.nodes[targetPath]
  if (!node) return state.root
  if (node.entry.isDir) return targetPath
  return node.entry.parent || state.root
}

/** 拼接绝对路径(自动选择分隔符,匹配 root 的风格)。 */
export function joinPath(parent: string, name: string): string {
  const sep = parent.includes("\\") ? "\\" : "/"
  if (parent.endsWith(sep)) return parent + name
  return parent + sep + name
}

/** 获取给定父目录下的同级名称列表(基于当前 store 快照)。 */
export function siblingNamesOf(parentPath: string): string[] {
  const state = useWorkspaceStore.getState()
  const { root, rootChildren, nodes } = state
  const paths =
    parentPath === root ? rootChildren : nodes[parentPath]?.childrenPaths ?? []
  return paths.map((p) => nodes[p]?.entry.name).filter((n): n is string => !!n)
}

/**
 * 新建文件。成功后:
 * - 触发父目录刷新(即使 watcher 正常也无害,seq 会去重);
 * - 展开父目录;
 * - 选中新建条目并尝试滚入视口。
 */
export async function createFile(
  parentPath: string,
  name: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const abs = joinPath(parentPath, name)
  try {
    await FileService.Write({ path: abs, content: "" })
    await refreshAfterMutation(parentPath)
    afterCreate(abs, parentPath, false)
    toast.success("新建文件成功", name)
    return { ok: true, path: abs }
  } catch (err) {
    const msg = extractErrorMessage(err)
    toast.error("新建文件失败", msg)
    return { ok: false, error: msg }
  }
}

/**
 * 新建文件夹。成功后除选中/滚入视口外,自动展开该新目录。
 */
export async function createDirectory(
  parentPath: string,
  name: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const abs = joinPath(parentPath, name)
  try {
    await FileService.CreateDirectory(abs)
    await refreshAfterMutation(parentPath)
    afterCreate(abs, parentPath, true)
    toast.success("新建文件夹成功", name)
    return { ok: true, path: abs }
  } catch (err) {
    const msg = extractErrorMessage(err)
    toast.error("新建文件夹失败", msg)
    return { ok: false, error: msg }
  }
}

/** 重命名。新旧同名会静默 no-op。 */
export async function renameEntry(
  path: string,
  newName: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const res = await FileService.Rename({ path, newName })
    const newPath = res?.path ?? path
    const parent = useWorkspaceStore.getState().nodes[path]?.entry.parent ?? ""
    if (parent) await refreshAfterMutation(parent)
    if (res?.renamed) {
      afterRename(newPath, parent)
      toast.success("重命名成功", newName)
    }
    return { ok: true, path: newPath }
  } catch (err) {
    const msg = extractErrorMessage(err)
    toast.error("重命名失败", msg)
    return { ok: false, error: msg }
  }
}

export interface DeleteBatchResult {
  successPaths: string[]
  failures: { path: string; error: string }[]
}

/**
 * 批量删除。每个路径单独调用后端;逐条采集结果,单次批次一次性汇报。
 * 不做乐观移除,依赖 workspace:changed 事件 + 兜底刷新。
 */
export async function deletePaths(paths: string[]): Promise<DeleteBatchResult> {
  const result: DeleteBatchResult = { successPaths: [], failures: [] }
  const parents = new Set<string>()
  const state = useWorkspaceStore.getState()
  for (const p of paths) {
    const parent = state.nodes[p]?.entry.parent
    if (parent) parents.add(parent)
    try {
      await FileService.Delete(p)
      result.successPaths.push(p)
    } catch (err) {
      result.failures.push({ path: p, error: extractErrorMessage(err) })
    }
  }
  for (const parent of parents) {
    await refreshAfterMutation(parent)
  }
  if (result.failures.length === 0) {
    toast.success(
      "删除完成",
      result.successPaths.length > 1
        ? `共 ${result.successPaths.length} 项`
        : undefined,
    )
  } else if (result.successPaths.length === 0) {
    toast.error(
      "删除失败",
      result.failures
        .slice(0, 3)
        .map((f) => `${basename(f.path)}: ${f.error}`)
        .join("\n"),
    )
  } else {
    toast.error(
      `部分删除失败(成功 ${result.successPaths.length} / 失败 ${result.failures.length})`,
      result.failures
        .slice(0, 3)
        .map((f) => `${basename(f.path)}: ${f.error}`)
        .join("\n"),
    )
  }
  // 从选择集里剔除成功删除项
  const store = useWorkspaceStore.getState()
  store.clearSelection()
  return result
}

function afterCreate(path: string, parentPath: string, isDir: boolean) {
  const store = useWorkspaceStore.getState()
  // 确保父目录展开,便于用户看到新条目
  if (parentPath && parentPath !== store.root) {
    store.setExpanded(parentPath, true)
  }
  store.selectOnly(path)
  if (isDir) store.setExpanded(path, true)
  requestScrollIntoView(path)
}

function afterRename(newPath: string, parentPath: string) {
  const store = useWorkspaceStore.getState()
  if (parentPath && parentPath !== store.root) {
    store.setExpanded(parentPath, true)
  }
  store.selectOnly(newPath)
  requestScrollIntoView(newPath)
}

/** 在下一帧尝试把节点滚到可视区(节点渲染在事件回调后落地)。 */
function requestScrollIntoView(path: string) {
  const attempt = (tries: number) => {
    const el = document.querySelector<HTMLElement>(
      `[data-tree-path="${cssEscape(path)}"]`,
    )
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" })
      return
    }
    if (tries > 0) {
      requestAnimationFrame(() => attempt(tries - 1))
    }
  }
  requestAnimationFrame(() => attempt(10))
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s)
  }
  return s.replace(/["\\]/g, "\\$&")
}

async function refreshAfterMutation(parentPath: string): Promise<void> {
  const state = useWorkspaceStore.getState()
  if (!parentPath || parentPath === state.root) {
    await refreshRoot()
    return
  }
  await refreshDirectoryChildren(parentPath)
}

function extractErrorMessage(err: unknown): string {
  if (!err) return "未知错误"
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"))
  return idx >= 0 ? p.slice(idx + 1) : p
}