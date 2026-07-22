import { useMemo } from "react"

import { RichEditor } from "@/shared/rich-editor"

import type { ExecSegment } from "@/entities/exec-command"
import { decodeExecMeta, stripExecMeta } from "@/entities/exec-command"

import { BatchSummary } from "./batch-summary"
import { ChangeCard } from "./change-card"
import { ParseErrorCard } from "./parse-error-card"

interface AssistantMessageProps {
  content: string
}

/**
 * AI 消息展示态。
 *
 * 输入:AI 原文 + 尾部 __EXEC_META__ sentinel(由后端注入)。
 * 无 sentinel 时退化为普通 markdown。
 *
 * 渲染流水:
 *   1. 剥离 sentinel 得到纯正文(备用作 fallback)
 *   2. 从 sentinel 里取 segments 直接渲染:文本段 → RichEditor(markdown),
 *      指令段 → ChangeCard,解析错误 → ParseErrorCard
 *   3. 顶部叠加变更汇总条(pending / done)
 */
export function AssistantMessage({ content }: AssistantMessageProps) {
  const { text, meta } = useMemo(() => {
    const meta = decodeExecMeta(content)
    const text = stripExecMeta(content)
    return { text, meta }
  }, [content])

  // 无 sentinel 或空 segments:普通 markdown
  if (!meta || meta.segments.length === 0) {
    return (
      <div className="min-w-0 max-w-none">
        <RichEditor
          value={text}
          mode="readonly"
          markdown
          fileTokens={{ enabled: true }}
          templateTokens={{ enabled: true }}
          className="min-w-0 max-w-none"
        />
      </div>
    )
  }

  const pending = meta.status === "pending"
  const results = meta.segments
    .map((seg) => (seg.type === "cmd" || seg.type === "parseError" ? seg.result : undefined))
    .filter((r): r is NonNullable<typeof r> => r != null)

  return (
    <div className="min-w-0 max-w-none">
      <BatchSummary
        totalCommands={meta.totalCommands}
        results={results}
        batchId={meta.batchId}
        pending={pending}
      />

      {meta.segments.map((seg, idx) => renderSegment(seg, idx))}
    </div>
  )
}

function renderSegment(seg: ExecSegment, idx: number) {
  const key = `seg-${idx}`
  if (seg.type === "text") {
    return (
      <div key={key} className="my-1">
        <RichEditor
          value={seg.value}
          mode="readonly"
          markdown
          fileTokens={{ enabled: true }}
          templateTokens={{ enabled: true }}
          className="min-w-0 max-w-none"
        />
      </div>
    )
  }
  if (seg.type === "parseError") {
    return (
      <ParseErrorCard
        key={key}
        raw={seg.raw ?? ""}
        message={seg.message ?? "解析失败"}
      />
    )
  }
  return <ChangeCard key={key} command={seg.command} result={seg.result} />
}
