import { AlertTriangle } from "lucide-react"
import { useEffect } from "react"

import { cn } from "@/lib/utils"

/**
 * 极简确认对话框。受控组件,由调用方持有 open 状态。
 * 与项目内更完整的 shadcn AlertDialog 相比,这里保持零依赖,只覆盖删除确认场景。
 */
interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  tone?: "default" | "danger"
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  tone = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      else if (e.key === "Enter" && !loading) onConfirm()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, loading, onConfirm, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={loading ? undefined : onCancel}
      />
      <div className="relative z-10 w-[360px] max-w-[92vw] rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl">
        <div className="flex items-start gap-2.5">
          {tone === "danger" && (
            <span className="mt-0.5 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{title}</div>
            {description && (
              <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border bg-background px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "rounded-md px-3 py-1 text-xs text-white disabled:opacity-60",
              tone === "danger"
                ? "bg-destructive hover:bg-destructive/90"
                : "bg-primary hover:bg-primary/90",
            )}
          >
            {loading ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}