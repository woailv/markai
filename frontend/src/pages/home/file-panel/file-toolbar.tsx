import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  RotateCcw,
  Save,
} from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

interface FileToolbarProps {
  path: string
  dirty: boolean
  readonly?: boolean
  lineCount: number
  charCount: number
  externallyChanged: boolean
  onSave: () => void
  onReload: () => void
  onCopyAll: () => void
}

/**
 * 底部工具栏 + 磁盘变更提示条。
 * 顶部面包屑由外层 file-panel 直接渲染,这里只关注操作按钮。
 */
export function FileToolbar({
  path,
  dirty,
  readonly,
  lineCount,
  charCount,
  externallyChanged,
  onSave,
  onReload,
  onCopyAll,
}: FileToolbarProps) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(t)
  }, [copied])

  return (
    <div className="shrink-0 border-t bg-muted/20">
      {externallyChanged && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11.5px] text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            文件已在外部修改。当前有未保存改动,是否重新加载?
          </span>
          <button
            type="button"
            onClick={onReload}
            className="rounded border border-amber-500/40 bg-background/60 px-2 py-0.5 text-[11px] hover:bg-background"
          >
            重新加载
          </button>
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{lineCount} 行</span>
          <span>{charCount} 字符</span>
          {readonly && <span className="text-amber-600">只读</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onCopyAll()
              setCopied(true)
            }}
            title="复制全部内容"
            className="flex h-6 items-center gap-1 rounded-sm px-1.5 hover:bg-muted hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <ClipboardCopy className="h-3 w-3" />
            )}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
          <button
            type="button"
            onClick={onReload}
            title="重新加载(丢弃未保存改动)"
            className="flex h-6 items-center gap-1 rounded-sm px-1.5 hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            <span>重载</span>
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || readonly}
            title="保存 (Ctrl+S)"
            className={cn(
              "flex h-6 items-center gap-1 rounded-sm px-1.5",
              dirty && !readonly
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : "text-muted-foreground/60 cursor-not-allowed",
            )}
          >
            <Save className="h-3 w-3" />
            <span>保存</span>
          </button>
        </div>
      </div>
      <div
        className="truncate border-t px-3 py-0.5 text-[10.5px] text-muted-foreground/70"
        title={path}
      >
        {path}
      </div>
    </div>
  )
}