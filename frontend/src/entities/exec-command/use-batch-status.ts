import { useCallback, useEffect, useState } from "react"

import { SnapshotService } from "@/../bindings/prompttool/internal/services/snapshot"
import type { BatchStatus } from "@/../bindings/prompttool/internal/services/snapshot/models"

import { confirmDestructive } from "@/shared/ui"

/**
 * 封装批次状态查询与撤销流程。
 * - status: 后端查询到的批次状态,null 表示尚未加载或不存在
 * - undoing: 正在执行撤销
 * - undo(): Promise 化的撤销;含确认弹窗与 stale 警告
 */
export function useBatchStatus(batchId?: number) {
  const [status, setStatus] = useState<BatchStatus | null>(null)
  const [undoing, setUndoing] = useState(false)

  const refresh = useCallback(async () => {
    if (!batchId) return
    try {
      const s = await SnapshotService.Status(batchId)
      setStatus(s ?? null)
    } catch (err) {
      console.error("[useBatchStatus] Status failed", err)
    }
  }, [batchId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const undo = useCallback(async () => {
    if (!batchId || !status || undoing) return
    if (status.undoneAt) return

    const desc = status.staleWarning
      ? "警告：此批次中的某些文件在此后又被修改过。撤销将覆盖那些较新的修改，确认继续？"
      : "确认撤销此批次修改？将还原所有涉及的文件到执行前的状态。"

    const ok = await confirmDestructive({
      title: "撤销文件修改",
      description: desc,
      destructiveLabel: "确认撤销",
    })
    if (!ok) return

    setUndoing(true)
    try {
      await SnapshotService.Undo(batchId)
      await refresh()
    } catch (err) {
      alert(`撤销失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUndoing(false)
    }
  }, [batchId, status, undoing, refresh])

  return { status, undoing, undo, refresh }
}