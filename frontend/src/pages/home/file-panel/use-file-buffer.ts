import { useCallback, useEffect, useRef, useState } from "react"

import { useTabStore } from "@/store"

import type { BufferSource } from "./buffer-source"

export type LoadStatus = "idle" | "loading" | "ready" | "error"

export interface FileBuffer {
  /** 数据源上一次 load 得到的原始内容 */
  originalContent: string
  /** 编辑器当前展示的内容 */
  content: string
  /** 是否已修改(与 originalContent 不同) */
  dirty: boolean
  /** 磁盘 mtime(仅 file 源有意义),用于乐观并发检测 */
  modTime: number
  /** 磁盘大小(仅 file 源有意义) */
  size: number
  status: LoadStatus
  error?: string
  /** 外部内容发生变更但用户尚未确认时置 true */
  externallyChanged: boolean
}

interface UseFileBufferOptions {
  tabId: string
  source: BufferSource
}

interface UseFileBufferResult {
  buffer: FileBuffer
  setContent: (v: string) => void
  save: () => Promise<{ ok: boolean; error?: string }>
  reload: () => Promise<void>
  /** 用户选择"忽略外部改动继续编辑" */
  dismissExternalChange: () => void
}

const EMPTY_BUFFER = (): FileBuffer => ({
  originalContent: "",
  content: "",
  dirty: false,
  modTime: 0,
  size: 0,
  status: "loading",
  externallyChanged: false,
})

/**
 * 单个 buffer(file / template)的编辑缓冲区。
 * - 挂载或 source 变化时重新 load
 * - setContent 更新脏状态,同步到 tabStore
 * - save 由 source 具体实现(带 mtime 并发保护 or 直接覆盖)
 * - subscribe 处理外部改动:dirty 时提示,否则静默重载
 */
export function useFileBuffer({
  tabId,
  source,
}: UseFileBufferOptions): UseFileBufferResult {
  const [buffer, setBuffer] = useState<FileBuffer>(() => EMPTY_BUFFER())
  const bufferRef = useRef(buffer)
  bufferRef.current = buffer

  /**
   * 自身刚保存后短时间内,外部通知的 modified 极大概率是我们自己写盘触发的。
   * 窗口期内忽略同 source 的 modified,避免二次 load() 把编辑器 value 换成
   * 新引用导致光标/滚动位置被重置。
   */
  const suppressSelfModifyUntilRef = useRef(0)
  const SELF_MODIFY_SUPPRESS_MS = 1500

  const setDirty = useTabStore((s) => s.setDirty)

  const load = useCallback(async () => {
    setBuffer((b) => ({ ...b, status: "loading", error: undefined }))
    try {
      const res = await source.load()
      setBuffer({
        originalContent: res.content,
        content: res.content,
        dirty: false,
        modTime: res.modTime,
        size: res.size,
        status: "ready",
        error: undefined,
        externallyChanged: false,
      })
      setDirty(tabId, false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setBuffer((b) => ({ ...b, status: "error", error: msg }))
    }
  }, [setDirty, source, tabId])

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

  const save = useCallback(async (): Promise<{
    ok: boolean
    error?: string
  }> => {
    const cur = bufferRef.current
    if (cur.status !== "ready") return { ok: false, error: "内容未就绪" }
    suppressSelfModifyUntilRef.current = Date.now() + SELF_MODIFY_SUPPRESS_MS
    const expected = source.usesModTime
      ? cur.externallyChanged
        ? 0
        : cur.modTime
      : 0
    const res = await source.save(cur.content, expected)
    if (!res.ok) {
      return { ok: false, error: res.error }
    }
    // 关键:不覆盖 content 字段,保持编辑器 value 引用不变,防止 CodeMirror
    // 因 value prop 变化而重建文档、丢失光标/滚动位置。
    setBuffer((b) => ({
      ...b,
      originalContent: cur.content,
      dirty: false,
      modTime: res.modTime ?? b.modTime,
      size: res.size ?? b.size,
      externallyChanged: false,
    }))
    setDirty(tabId, false)
    // 写盘完成,再延长一次守卫窗口(文件系统事件可能滞后到达)
    suppressSelfModifyUntilRef.current = Date.now() + SELF_MODIFY_SUPPRESS_MS
    return { ok: true }
  }, [setDirty, source, tabId])

  const reload = useCallback(async () => {
    await load()
  }, [load])

  const dismissExternalChange = useCallback(() => {
    setBuffer((b) => ({ ...b, externallyChanged: false }))
  }, [])

  // 订阅 source 外部变化
  useEffect(() => {
    const unsub = source.subscribe((change) => {
      if (change.type === "renamed") {
        // 文件重命名:key 稳定性由 file source 内部维护,视图无需重载
        return
      }
      if (change.type === "removed") {
        // 由 source 侧负责标记失效;这里仅置外部变化态,避免误覆盖用户 dirty 内容
        setBuffer((b) => ({ ...b, externallyChanged: true }))
        return
      }
      // modified:自身刚保存触发的忽略
      if (Date.now() < suppressSelfModifyUntilRef.current) return
      if (bufferRef.current.dirty) {
        setBuffer((b) => ({ ...b, externallyChanged: true }))
      } else {
        void load()
      }
    })
    return () => {
      unsub()
    }
  }, [load, source])

  return {
    buffer,
    setContent,
    save,
    reload,
    dismissExternalChange,
  }
}