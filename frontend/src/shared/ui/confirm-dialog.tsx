import { AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

/**
 * Promise 化的确认对话框。
 *
 * 通过全局订阅者机制在应用根部渲染 <ConfirmDialogHost/>,
 * 任意位置 await confirmDestructive({...}) 即可获得布尔结果。
 * 相比 window.confirm(),支持自定义标题/详情/等宽路径展示。
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

  if (!pending) return null

  const close = (result: boolean) => {
    pending.resolve(result)
    setPending(null)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={() => close(false)}
    >
      <div
        className="w-[420px] max-w-[90vw] rounded-lg border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{pending.title}</p>
            {pending.description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {pending.description}
              </p>
            )}
            {pending.path && (
              <p className="mt-2 break-all rounded bg-muted px-2 py-1 font-mono text-[11px]">
                {pending.path}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => close(false)}
          >
            {pending.cancelLabel ?? "取消"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => close(true)}
          >
            {pending.destructiveLabel ?? "继续"}
          </Button>
        </div>
      </div>
    </div>
  )
}