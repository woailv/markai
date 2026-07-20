import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

/**
 * dirty tab 关闭前的三选一确认框:保存 / 不保存 / 取消。
 * 参考 executor/confirm-dialog 的命令式 API,避免调用方到处塞 provider。
 *
 * 用法:
 *   const choice = await confirmCloseDirty({ title: "关闭未保存的文件" })
 *   if (choice === "save") { await save(); doClose() }
 *   else if (choice === "discard") { doClose() }
 *   // cancel:什么都不做
 */

export type CloseChoice = "save" | "discard" | "cancel"

interface Payload {
  title: string
  description?: string
  saveLabel?: string
  discardLabel?: string
  cancelLabel?: string
  resolve: (choice: CloseChoice) => void
}

let pushPayload: ((p: Payload) => void) | null = null

export function confirmCloseDirty(opts: {
  title: string
  description?: string
  saveLabel?: string
  discardLabel?: string
  cancelLabel?: string
}): Promise<CloseChoice> {
  return new Promise((resolve) => {
    if (!pushPayload) {
      // Host 未挂载,默认取消,避免误关。
      resolve("cancel")
      return
    }
    pushPayload({ ...opts, resolve })
  })
}

export function CloseConfirmDialogHost() {
  const [payload, setPayload] = useState<Payload | null>(null)

  useEffect(() => {
    pushPayload = (p) => setPayload(p)
    return () => {
      pushPayload = null
    }
  }, [])

  useEffect(() => {
    if (!payload) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        payload.resolve("cancel")
        setPayload(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [payload])

  if (!payload) return null

  const choose = (choice: CloseChoice) => {
    payload.resolve(choice)
    setPayload(null)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={() => choose("cancel")}
    >
      <div
        className="w-[420px] max-w-[92vw] rounded-md border bg-popover p-5 text-popover-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold">{payload.title}</div>
        {payload.description && (
          <div className="mt-2 text-sm text-muted-foreground">
            {payload.description}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => choose("cancel")}
          >
            {payload.cancelLabel ?? "取消"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => choose("discard")}
          >
            {payload.discardLabel ?? "不保存"}
          </Button>
          <Button size="sm" onClick={() => choose("save")}>
            {payload.saveLabel ?? "保存"}
          </Button>
        </div>
      </div>
    </div>
  )
}