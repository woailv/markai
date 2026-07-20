import { ClipboardService } from "@/../bindings/prompttool/internal/services/clipboard"
import { FileService } from "@/../bindings/prompttool/internal/services/file"
import { useWorkspaceStore } from "./workspace.store"

import { toast } from "../ui/toast"
import { loadDirectoryChildren, refreshRoot } from "./use-workspace-events"

/**
 * 将 selectedPaths 覆盖为给定集合(zustand 直接写)。
 * store 未提供批量选中 action,故在此就地实现。
 */
function selectPaths(paths: string[]) {
  const store = useWorkspaceStore
  const primary = paths[paths.length - 1] ?? null
  store.setState({
    selectedPaths: new Set(paths),
    selectedPath: primary,
    anchorPath: primary,
  })
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"))
  return idx >= 0 ? p.slice(idx + 1) : p
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

async function refreshTarget(targetDir: string): Promise<void> {
  const state = useWorkspaceStore.getState()
  if (!targetDir || targetDir === state.root) {
    await refreshRoot()
    return
  }
  await loadDirectoryChildren(targetDir)
}

/**
 * 汇总同名重命名提示:比较返回路径 basename 与源 basename,
 * 不一致的视为被后端自动重命名。
 */
function summarizeRenames(srcPaths: string[], resultPaths: string[]): string[] {
  const notes: string[] = []
  const n = Math.min(srcPaths.length, resultPaths.length)
  for (let i = 0; i < n; i++) {
    const srcName = basename(srcPaths[i])
    const dstName = basename(resultPaths[i])
    if (srcName && dstName && srcName !== dstName) {
      notes.push(`${srcName} → ${dstName}`)
    }
  }
  return notes
}

/**
 * 直接把一组绝对路径复制/剪切到目标工作区目录。
 * 成功后刷新目标目录并将新落地的路径设为多选。
 */
export async function pasteFromPaths(
  srcPaths: string[],
  targetDir: string,
  cut: boolean,
): Promise<string[]> {
  if (!srcPaths || srcPaths.length === 0) return []
  if (!targetDir) {
    toast.error("无法粘贴", "未设置工作区目录")
    return []
  }
  try {
    const result =
      (await FileService.CopyPathsToWorkspace(srcPaths, targetDir, cut)) ?? []
    await refreshTarget(targetDir)
    if (result.length > 0) {
      selectPaths(result)
    }
    const renamed = summarizeRenames(srcPaths, result)
    const action = cut ? "移动" : "复制"
    if (renamed.length > 0) {
      toast.success(
        `${action}完成`,
        `已重命名以避免冲突:\n${renamed.slice(0, 3).join("\n")}${
          renamed.length > 3 ? `\n… 共 ${renamed.length} 项` : ""
        }`,
      )
    } else {
      toast.success(
        `${action}完成`,
        result.length > 1 ? `共 ${result.length} 项` : undefined,
      )
    }
    return result
  } catch (err) {
    toast.error("粘贴失败", extractErrorMessage(err))
    return []
  }
}

/**
 * 将当前选中路径写入系统剪贴板(供 Ctrl+C 使用)。
 * 后端使用平台原生 API(Windows CF_HDROP / macOS osascript / Linux wl-copy|xclip)
 * 写入,粘贴时用户既可在应用内 Ctrl+V,也可在系统文件管理器中 Ctrl+V。
 */
export async function copyPathsToSystemClipboard(
  paths: string[],
): Promise<boolean> {
  if (!paths || paths.length === 0) return false
  try {
    await ClipboardService.WritePaths(paths)
    toast.info("已复制", paths.length > 1 ? `${paths.length} 项` : undefined)
    return true
  } catch (err) {
    toast.error("复制失败", extractErrorMessage(err))
    return false
  }
}

/**
 * 从系统剪贴板粘贴到目标目录(供 Ctrl+V 使用)。
 * 由后端读取剪贴板中的文件引用并复制到 targetDir,若剪贴板标记为"剪切"
 * (Windows Preferred DropEffect=2),后端会在复制成功后删除源。
 * 返回写入后的绝对路径列表,并将其设为多选。
 */
export async function pasteFromSystemClipboard(
  targetDir: string,
): Promise<string[]> {
  if (!targetDir) {
    toast.error("无法粘贴", "未设置工作区目录")
    return []
  }
  try {
    const res = await FileService.PasteFromClipboard(targetDir)
    const written = res?.written ?? []
    if (written.length === 0) {
      // 剪贴板不含文件引用:静默返回,调用方可决定是否降级
      return []
    }
    await refreshTarget(targetDir)
    selectPaths(written)
    const action = res?.cut ? "移动" : "复制"
    toast.success(
      `${action}完成`,
      written.length > 1 ? `共 ${written.length} 项` : undefined,
    )
    return written
  } catch (err) {
    toast.error("粘贴失败", extractErrorMessage(err))
    return []
  }
}

/**
 * 从 DataTransfer(系统拖入)中解析源:
 *   1) 优先 text/uri-list(file:// URI)→ 走 pasteFromPaths
 *   2) 否则 dt.files 逐个 WriteBytesToWorkspace(仅复制语义)
 */
export async function pasteFromClipboardData(
  dt: DataTransfer | null,
  targetDir: string,
): Promise<string[]> {
  if (!dt) return []
  if (!targetDir) {
    toast.error("无法粘贴", "未设置工作区目录")
    return []
  }

  const uriList = safeGetData(dt, "text/uri-list")
  const filePaths = uriList ? parseUriList(uriList) : []
  if (filePaths.length > 0) {
    return pasteFromPaths(filePaths, targetDir, false)
  }

  // 回退:处理 File 对象(拖入 / 剪贴板图片等)
  const files = dt.files ? Array.from(dt.files) : []
  if (files.length === 0) return []

  const pendingId = Symbol("pending")
  void pendingId
  toast.info("正在写入…", files.length > 1 ? `共 ${files.length} 个文件` : undefined)

  const written: string[] = []
  try {
    for (const f of files) {
      const buf = await f.arrayBuffer()
      const bytes = Array.from(new Uint8Array(buf))
      // 后端签名 (fileName, data, workspaceDir)
      // 类型标注为 string 但实际会被 JSON 序列化为 number[](Wails runtime 处理)
      const dst = await FileService.WriteBytesToWorkspace(
        f.name,
        bytes as unknown as string,
        targetDir,
      )
      if (dst) written.push(dst)
    }
    await refreshTarget(targetDir)
    if (written.length > 0) {
      selectPaths(written)
    }
    toast.success(
      "写入完成",
      written.length > 1 ? `共 ${written.length} 项` : undefined,
    )
    return written
  } catch (err) {
    toast.error("写入失败", extractErrorMessage(err))
    return written
  }
}

function safeGetData(dt: DataTransfer, type: string): string {
  try {
    return dt.getData(type) || ""
  } catch {
    return ""
  }
}

/**
 * 解析 text/uri-list:每行一个 URI,# 开头是注释;
 * decodeURIComponent 后去掉 file:// 前缀。
 * Windows 上 file:///C:/... 需要再去掉开头的 /。
 */
function parseUriList(text: string): string[] {
  const out: string[] = []
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    if (!line.toLowerCase().startsWith("file:")) continue
    let decoded: string
    try {
      decoded = decodeURIComponent(line)
    } catch {
      decoded = line
    }
    let p = decoded.replace(/^file:\/\//i, "")
    // Windows: /C:/foo → C:/foo
    if (/^\/[a-zA-Z]:[\/\\]/.test(p)) {
      p = p.slice(1)
    }
    // 统一反斜杠给 Windows 更亲和(后端 Clean 会归一化,不强制)
    out.push(p)
  }
  return out
}