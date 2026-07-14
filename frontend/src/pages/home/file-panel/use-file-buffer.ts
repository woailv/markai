import { Events } from "@wailsio/runtime"
import { useCallback, useEffect, useRef, useState } from "react"

import { FileService } from "@/../bindings/prompttool/internal/services"
import { useTabStore } from "@/store"

import type { WorkspaceChangedEvent } from "../workspace-tree/types"

export type LoadStatus = "idle" | "loading" | "ready" | "error"

export interface FileBuffer {
  path: string
  /** 文件磁盘上的原始内容 */
  originalContent: string
  /** 编辑器当前展示的内容 */
  content: string
  /** 是否已修改(与 originalContent 不同) */
  dirty: boolean
  /** 磁盘 mtime,用于乐观并发检测 */
  modTime: number
  /** 磁盘大小 */
  size: number
  status: LoadStatus
  error?: string
  /** 磁盘发生外部变更但用户未确认时置 true */
  externallyChanged: boolean
}

interface UseFileBufferOptions {
  tabId: string
  path: string
}

interface UseFileBufferResult {
  buffer: FileBuffer
  setContent: (v: string) => void
  save: () => Promise<{ ok: boolean; error?: string }>
  reload: () => Promise<void>
  /** 用户选择"忽略外部改动继续编辑" */
  dismissExternalChange: () => void
}

const EMPTY_BUFFER = (path: string): FileBuffer => ({
  path,
  originalContent: "",
  content: "",
  dirty: false,
  modTime: 0,
  size: 0,
  status: "loading",
  externallyChanged: false,
})

/**
 * 单个 file tab 的内容缓冲区。
 * - 挂载时读文件,path 变化重新加载
 * - setContent 更新脏状态,同步到 tabStore
 * - save 通过 ExpectedModTime 做并发保护
 * - 订阅 workspace:changed:同路径的 modify/rename/remove 事件都要处理
 */
export function useFileBuffer({
  tabId,
  path,
}: UseFileBufferOptions): UseFileBufferResult {
  const [buffer, setBuffer] = useState<FileBuffer>(() => EMPTY_BUFFER(path))
  const bufferRef = useRef(buffer)
  bufferRef.current = buffer

  const setDirty = useTabStore((s) => s.setDirty)
  const markFilePathInvalid = useTabStore((s) => s.markFilePathInvalid)
  const updateFilePath = useTabStore((s) => s.updateFilePath)

  const load = useCallback(async () => {
    setBuffer((b) => ({ ...b, status: "loading", error: undefined }))
    try {
      const res = await FileService.Read(path)
      if (!res) {
        setBuffer((b) => ({
          ...b,
          status: "error",
          error: "文件读取返回空",
        }))
        return
      }
      setBuffer({
        path,
        originalContent: res.content ?? "",
        content: res.content ?? "",
        dirty: false,
        modTime: res.modTime,
        size: res.size,
        status: "ready",
        error: undefined,
        externallyChanged: false,
      })
      setDirty(tabId, false)
      markFilePathInvalid(path, false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setBuffer((b) => ({ ...b, status: "error", error: msg }))
      markFilePathInvalid(path, true)
    }
  }, [markFilePathInvalid, path, setDirty, tabId])

  useEffect(() => {
    void load()
  }, [load])

  const setContent = useCallback(
    (v: string) => {
      setBuffer((b) => {
        const dirty = v !== b.originalContent
        if (dirty !== b.dirty) {
          setDirty(tabId, dirty)
        }
        return { ...b, content: v, dirty }
      })
    },
    [setDirty, tabId],
  )

  const save = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const cur = bufferRef.current
    if (cur.status !== "ready") return { ok: false, error: "文件未就绪" }
    try {
      const res = await FileService.Write({
        path: cur.path,
        content: cur.content,
        expectedModTime: cur.externallyChanged ? 0 : cur.modTime,
      })
      // 保存成功后 mtime 不在返回值内,重新 stat 一次
      const stat = await FileService.Read(cur.path)
      setBuffer((b) => ({
        ...b,
        originalContent: cur.content,
        dirty: false,
        modTime: stat?.modTime ?? b.modTime,
        size: stat?.size ?? b.size,
        externallyChanged: false,
      }))
      setDirty(tabId, false)
      // res 供后续可能的 diff 展示;当前不使用。
      void res
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  }, [setDirty, tabId])

  const reload = useCallback(async () => {
    await load()
  }, [load])

  const dismissExternalChange = useCallback(() => {
    setBuffer((b) => ({ ...b, externallyChanged: false }))
  }, [])

  // 订阅 workspace:changed 事件,同步 rename/remove/modify
  useEffect(() => {
    const unsub = Events.On("workspace:changed", (evt) => {
      const payload = (Array.isArray(evt.data) ? evt.data[0] : evt.data) as
        | WorkspaceChangedEvent
        | undefined
      if (!payload) return
      const curPath = bufferRef.current.path
      // rename/move: oldPath 匹配 → 同步新路径
      if (
        (payload.type === "rename" || payload.type === "move") &&
        payload.oldPath === curPath
      ) {
        updateFilePath(curPath, payload.path)
        setBuffer((b) => ({ ...b, path: payload.path }))
        return
      }
      if (payload.path !== curPath) return
      if (payload.type === "remove" || payload.type === "delete") {
        markFilePathInvalid(curPath, true)
        return
      }
      if (payload.type === "modify" && payload.entry) {
        // 若 dirty,标记为 externallyChanged 等用户决策;否则静默重载
        if (bufferRef.current.dirty) {
          setBuffer((b) => ({ ...b, externallyChanged: true }))
        } else {
          void load()
        }
      }
    })
    return () => {
      unsub()
    }
  }, [load, markFilePathInvalid, updateFilePath])

  return {
    buffer,
    setContent,
    save,
    reload,
    dismissExternalChange,
  }
}