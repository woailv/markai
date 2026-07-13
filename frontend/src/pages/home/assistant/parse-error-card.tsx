import { AlertOctagon } from "lucide-react"
import { useState } from "react"

export function ParseErrorCard({
  raw,
  message,
}: {
  raw: string
  message: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-2 overflow-hidden rounded-md border border-destructive/40 bg-destructive/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
      >
        <AlertOctagon className="h-3.5 w-3.5 text-destructive" />
        <span className="text-[11px] font-semibold text-destructive">
          指令解析失败
        </span>
        <span className="truncate text-[11px] text-destructive/80">
          {message}
        </span>
      </button>
      {open && (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all border-t border-destructive/20 bg-background/40 px-2 py-1.5 font-mono text-[10.5px] leading-snug">
          {raw}
        </pre>
      )}
    </div>
  )
}