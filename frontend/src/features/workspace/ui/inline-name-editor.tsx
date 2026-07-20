import {
  File as FileIcon,
  Folder,
  Loader2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { validateName } from "../model/file-ops"

interface InlineNameEditorProps {
  depth: number
  initialName: string
  /** 是否为目录图标(新建/重命名的对象类型) */
  isDir: boolean
  /** 同级已有名称,用于查重(重命名时应排除自身) */
  siblingNames: string[]
  /** 若是重命名,传入原名以允许保留原名不校验冲突 */
  originalName?: string
  /** 确认(回车) */
  onSubmit: (name: string) => Promise<void> | void
  /** 取消(Esc / blur) */
  onCancel: () => void
}

/**
 * 内联名字编辑器。用于:
 *  - 新建文件 / 新建文件夹(initialName = "",originalName = undefined)
 *  - 重命名(initialName = 原名,originalName = 原名)
 *
 * 默认选中策略:
 *  - 目录:全选
 *  - 文件:选中扩展名前的部分(无扩展名则全选)
 */
export function InlineNameEditor({
  depth,
  initialName,
  isDir,
  siblingNames,
  originalName,
  onSubmit,
  onCancel,
}: InlineNameEditorProps) {
  const [value, setValue] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validation = useMemo(
    () => validateName(value, siblingNames, originalName),
    [value, siblingNames, originalName],
  )

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    if (!initialName) {
      // 新建:空文本,聚焦即可
      return
    }
    if (isDir) {
      el.select()
      return
    }
    // 文件:选中扩展名前的部分
    const dot = initialName.lastIndexOf(".")
    if (dot > 0) {
      el.setSelectionRange(0, dot)
    } else {
      el.select()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = async () => {
    if (submitting) return
    if (!validation.ok) return
    const trimmed = value.trim()
    if (originalName !== undefined && trimmed === originalName) {
      onCancel()
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setSubmitting(false)
    }
  }

  const iconClass = "h-3.5 w-3.5 shrink-0"

  return (
    <div
      className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-[12.5px] leading-tight"
      style={{ paddingLeft: 6 + depth * 12 }}
    >
      {/* 占位:与 tree-node 的 chevron 位置对齐 */}
      <span className="h-4 w-4 shrink-0" />
      <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
        {isDir ? (
          <Folder className={cn(iconClass, "text-amber-500/80")} />
        ) : (
          <FileIcon className={iconClass} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void commit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              onCancel()
            }
            e.stopPropagation()
          }}
          onBlur={() => {
            // blur 视为取消(避免鬼影提交)
            if (!submitting) onCancel()
          }}
          disabled={submitting}
          className={cn(
            "min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-[12.5px] outline-none",
            !validation.ok && value.length > 0
              ? "border-destructive focus:border-destructive"
              : "border-primary/60 focus:border-primary",
          )}
          spellCheck={false}
          autoComplete="off"
        />
        {!validation.ok && value.length > 0 && validation.reason && (
          <span className="mt-0.5 text-[10.5px] text-destructive">
            {validation.reason}
          </span>
        )}
      </div>
      {submitting && (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}