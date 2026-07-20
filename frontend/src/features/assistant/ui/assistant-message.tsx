import { useMemo } from "react"

import { RichEditor } from "@/shared/rich-editor"

import type { ExecResultBase } from "@/entities/exec-command"
import { parseCommandsWithRanges } from "@/entities/exec-command"
import type { ParseItem } from "@/entities/exec-command"
import { decodeExecMeta, stripExecMeta } from "@/entities/exec-command"
import {
  decodeExecPayload,
  ExecReportView,
  ExecStatusView,
} from "@/entities/exec-command"

import { BatchSummary } from "./batch-summary"
import { ChangeCard } from "./change-card"
import { ParseErrorCard } from "./parse-error-card"

interface AssistantMessageProps {
  content: string
}

/**
 * AI 消息展示态。
 *
 * 输入:AI 原文(含 XML 指令) + 可选尾部 __EXEC_META__ sentinel。
 * 渲染流水:
 *   1. 剥离 sentinel 得到纯正文
 *   2. 解析指令与位置区间
 *   3. 按区间切片:文本段 → RichEditor(markdown),指令段 → ChangeCard
 *   4. 顶部叠加变更汇总条(pending / done)
 *
 * 若无指令(纯文本 assistant 回复,例如 AI 讨论问题),直接走 markdown 渲染。
 */
export function AssistantMessage({ content }: AssistantMessageProps) {
  // 兼容老会话:独立的 __EXEC_STATUS__ / __EXEC_REPORT__ 消息仍走旧渲染路径
  const legacy = useMemo(() => decodeExecPayload(content), [content])

  const { text, meta, ranges } = useMemo(() => {
    if (legacy) {
      return { text: "", meta: null, ranges: [] }
    }
    const meta = decodeExecMeta(content)
    const text = stripExecMeta(content)
    const ranges = parseCommandsWithRanges(text)
    return { text, meta, ranges }
  }, [content, legacy])

  if (legacy?.type === "status" && legacy.status) {
    return <ExecStatusView pending={legacy.status.pending} />
  }
  if (legacy?.type === "report" && legacy.report) {
    return <ExecReportView report={legacy.report} />
  }

  // 无指令:退化为普通 markdown 渲染,不显示汇总条
  if (ranges.length === 0) {
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

  const results = meta?.report?.results
  const pending = meta?.status === "pending" || !meta

  // 按区间切片:相邻区间之间是文本段,区间内是指令段
  const segments: Array<
    | { type: "text"; value: string; key: string }
    | { type: "cmd"; item: ParseItem; result?: ExecResultBase; key: string }
  > = []
  let cursor = 0
  ranges.forEach((r, idx) => {
    if (r.start > cursor) {
      const chunk = text.slice(cursor, r.start)
      if (chunk.trim().length > 0) {
        segments.push({ type: "text", value: chunk, key: `t-${idx}` })
      }
    }
    segments.push({
      type: "cmd",
      item: r.item,
      result: results?.[idx],
      key: `c-${idx}`,
    })
    cursor = r.end
  })
  if (cursor < text.length) {
    const tail = text.slice(cursor)
    if (tail.trim().length > 0) {
      segments.push({ type: "text", value: tail, key: "t-tail" })
    }
  }

  return (
    <div className="min-w-0 max-w-none">
      <BatchSummary
        totalCommands={ranges.length}
        results={results}
        batchId={meta?.report?.batchId}
        pending={pending}
      />

      {segments.map((seg) => {
        if (seg.type === "text") {
          return (
            <div key={seg.key} className="my-1">
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
        if (seg.item.kind === "PARSE_ERROR") {
          return (
            <ParseErrorCard
              key={seg.key}
              raw={seg.item.raw}
              message={seg.item.message}
            />
          )
        }
        return (
          <ChangeCard
            key={seg.key}
            command={seg.item}
            result={seg.result}
          />
        )
      })}
    </div>
  )
}