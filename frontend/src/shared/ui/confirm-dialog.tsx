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

/**
 * Promise 化的确认对话框。
 *
 * 通过全局订阅者机制在应用根部渲染 <ConfirmDialogHost/>,
 * 任意位置 await confirmDestructive({...}) 即可获得布尔结果。
 * 相比 window.confirm(),支持自定义标题/详情/等宽路径展示。
 *
 * 样式统一为「删除会话」对话框: AlertDialog + Header/Description/Footer,
 * destructive 操作使用 variant="destructive"。
 */

interface ConfirmOptions {
  title: string
  description?: string
  path?: string
  destructiveLabel?: string
  cancelLabel?: string
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (v: boolean) => void
}

let listener: ((p: PendingConfirm | null) => void) | null = null

export function confirmDestructive(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      // Host 未挂载时,降级到 window.confirm,保证可用性
      resolve(window.confirm(`${opts.title}\n${opts.description ?? ""}\n${opts.path ?? ""}`))
      return
    }
    listener({ ...opts, resolve })
  })
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  useEffect(() => {
    listener = setPending
    return () => {
      listener = null
    }
  }, [])

  const close = (result: boolean) => {
    pending?.resolve(result)
    setPending(null)
  }

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(o) => {
        if (!o) close(false)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title ?? ""}</AlertDialogTitle>
          {(pending?.description || pending?.path) && (
            <AlertDialogDescription>
              {pending?.description}
              {pending?.path && (
                <span className="mt-2 block break-all rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
                  {pending.path}
                </span>
              )}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {pending?.cancelLabel ?? "取消"}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => close(true)}>
            {pending?.destructiveLabel ?? "继续"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
