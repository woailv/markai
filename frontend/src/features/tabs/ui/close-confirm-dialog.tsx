import { useEffect, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/**
 * dirty tab 关闭前的三选一确认框:保存 / 不保存 / 取消。
 * 参考 executor/confirm-dialog 的命令式 API,避免调用方到处塞 provider。
 *
 * 样式统一为「删除会话」对话框: AlertDialog + Header/Description/Footer。
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

  const choose = (choice: CloseChoice) => {
    payload?.resolve(choice)
    setPayload(null)
  }

  return (
    <AlertDialog
      open={payload !== null}
      onOpenChange={(o) => {
        if (!o) choose("cancel")
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{payload?.title ?? ""}</AlertDialogTitle>
          {payload?.description && (
            <AlertDialogDescription>{payload.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => choose("cancel")}>
            {payload?.cancelLabel ?? "取消"}
          </AlertDialogCancel>
          <Button variant="outline" onClick={() => choose("discard")}>
            {payload?.discardLabel ?? "不保存"}
          </Button>
          <AlertDialogAction onClick={() => choose("save")}>
            {payload?.saveLabel ?? "保存"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
