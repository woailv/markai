import type { TemplateBlock } from "./types"
import { countChars, extractVariables } from "./variable-utils"

interface EditorStatusBarProps {
  blocks: TemplateBlock[]
  dirty: boolean
}

export function EditorStatusBar({ blocks, dirty }: EditorStatusBarProps) {
  const chars = countChars(blocks)
  const vars = extractVariables(blocks).length
  return (
    <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
      <StatusItem label="块" value={blocks.length} />
      <StatusItem label="字" value={chars} />
      <StatusItem label="变量" value={vars} />
      <span className="ml-auto flex items-center gap-1.5">
        <span
          className={
            "h-1.5 w-1.5 rounded-full " +
            (dirty ? "bg-amber-500" : "bg-emerald-500")
          }
        />
        {dirty ? "未保存的更改" : "已同步"}
      </span>
    </div>
  )
}

function StatusItem({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="tabular-nums font-medium text-foreground">{value}</span>
      <span>{label}</span>
    </span>
  )
}