import { AlertCircle, CheckCircle2, Info, X } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * 极简 toast:模块内单例订阅表 + 顶层 <ToastHost /> 渲染。
 * 未引入第三方库,避免为文件操作单独扩装依赖。
 */

export type ToastTone = "info" | "success" | "error"

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
  detail?: string
}

type Listener = (items: ToastItem[]) => void

let seq = 0
let items: ToastItem[] = []
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l(items)
}

function push(tone: ToastTone, message: string, detail?: string) {
  const id = ++seq
  items = [...items, { id, tone, message, detail }]
  notify()
  const ttl = tone === "error" ? 5000 : 2600
  setTimeout(() => {
    items = items.filter((it) => it.id !== id)
    notify()
  }, ttl)
}

export const toast = {
  info: (m: string, d?: string) => push("info", m, d),
  success: (m: string, d?: string) => push("success", m, d),
  error: (m: string, d?: string) => push("error", m, d),
}

export function ToastHost() {
  const [snap, setSnap] = useState<ToastItem[]>(items)
  useEffect(() => {
    const l: Listener = (next) => setSnap(next)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  if (snap.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[1000] flex w-[300px] flex-col gap-1.5">
      {snap.map((it) => (
        <div
          key={it.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs shadow-md",
            it.tone === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : it.tone === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border bg-popover text-popover-foreground",
          )}
        >
          <span className="mt-0.5 shrink-0">
            {it.tone === "error" ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : it.tone === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Info className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium leading-tight">{it.message}</div>
            {it.detail && (
              <div className="mt-0.5 whitespace-pre-wrap break-words opacity-80">
                {it.detail}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              items = items.filter((x) => x.id !== it.id)
              notify()
            }}
            className="shrink-0 rounded p-0.5 opacity-60 hover:bg-black/5 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}