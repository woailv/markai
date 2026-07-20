import { Events } from "@wailsio/runtime"

import { FileService } from "@/../bindings/prompttool/internal/services"
import { useTabStore } from "@/features/tabs"

import type { WorkspaceChangedEvent } from "@/entities/workspace"
import type {
  BufferExternalChange,
  BufferLoadResult,
  BufferSaveResult,
  BufferSource,
} from "./buffer-source"

/**
 * 文件系统数据源。
 *
 * - load/save 走 FileService,支持 ExpectedModTime 乐观并发保护。
 * - subscribe 订阅 workspace:changed,rename/remove/modify 均映射到 BufferExternalChange。
 * - rename 同时会把 tab store 里的路径同步一次,避免 UI 上仍显示旧路径。
 *
 * 注意:file source 是 stateful 的(内部持有 currentPath 供 rename 后跟随),
 * 但对外仍以初始 initialPath 作 key(use-file-buffer 用于判断 source 是否更换)。
 */
export class FileBufferSource implements BufferSource {
  readonly usesModTime = true
  readonly key: string
  private currentPath: string

  constructor(initialPath: string) {
    this.key = `file:${initialPath}`
    this.currentPath = initialPath
  }

  async load(): Promise<BufferLoadResult> {
    const res = await FileService.Read(this.currentPath)
    if (!res) throw new Error("文件读取返回空")
    return {
      content: res.content ?? "",
      modTime: res.modTime,
      size: res.size,
    }
  }

  async save(
    content: string,
    expectedModTime: number,
  ): Promise<BufferSaveResult> {
    try {
      await FileService.Write({
        path: this.currentPath,
        content,
        expectedModTime,
      })
      const stat = await FileService.Read(this.currentPath)
      return {
        ok: true,
        modTime: stat?.modTime ?? 0,
        size: stat?.size ?? 0,
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  subscribe(cb: (change: BufferExternalChange) => void): () => void {
    const unsub = Events.On("workspace:changed", (evt) => {
      const payload = (Array.isArray(evt.data) ? evt.data[0] : evt.data) as
        | WorkspaceChangedEvent
        | undefined
      if (!payload) return
      // rename/move: oldPath 匹配 → 同步新路径,同时通知外部
      if (
        (payload.type === "rename" || payload.type === "move") &&
        payload.oldPath === this.currentPath
      ) {
        const oldPath = this.currentPath
        this.currentPath = payload.path
        useTabStore.getState().updateFilePath(oldPath, payload.path)
        cb({ type: "renamed", newKey: payload.path })
        return
      }
      if (payload.path !== this.currentPath) return
      if (payload.type === "remove" || payload.type === "delete") {
        useTabStore.getState().markFilePathInvalid(this.currentPath, true)
        cb({ type: "removed" })
        return
      }
      if (payload.type === "modify" && payload.entry) {
        cb({ type: "modified" })
      }
    })
    return () => {
      unsub()
    }
  }
}