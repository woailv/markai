import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MinusCircle,
  SlashSquare,
} from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

import type { ExecResultBase, ExecutionReport } from "./command-executor"

/**
 * 执行回执消息的载体格式。
 *
 * 为了不改动 ChatMessage 结构,回执 / 状态占位仍以 `content: string` 承载,
 * 但用一个魔法首行标记,由 MessageContent 前置识别、切换到本组件渲染。
 *
 *   __EXEC_STATUS__\n{"pending":N}          执行中占位
 *   __EXEC_REPORT__\n{...ExecutionReport}   最终结构化回执
 */

export const EXEC_STATUS_TAG = "__EXEC_STATUS__"
export const EXEC_REPORT_TAG = "__EXEC_REPORT__"

export function encodeExecStatus(pending: number): string {
  return `${EXEC_STATUS_TAG}\n${JSON.stringify({ pending })}`
}

export function encodeExecReport(report: ExecutionReport): string {
  return `${EXEC_REPORT_TAG}\n${JSON.stringify(report)}`
}

export interface DecodedExec {
  type: "status" | "report"
  status?: { pending: number }
  report?: ExecutionReport
}

export function decodeExecPayload(content: string): DecodedExec | null {
  if (content.startsWith(EXEC_STATUS_TAG)) {
    try {
      const json = content.slice(EXEC_STATUS_TAG.length).trim()
      return { type: "status", status: JSON.parse(json) }
    } catch {
      return null
    }
  }
  if (content.startsWith(EXEC_REPORT_TAG)) {
    try {
      const json = content.slice(EXEC_REPORT_TAG.length).trim()
      return { type: "report", report: JSON.parse(json) }
    } catch {
      return null
    }
  }
  return null
}

export function ExecStatusView({ pending }: { pending: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      正在执行 {pending} 条指令…
    </div>
  )
}

export function ExecReportView({ report }: { report: ExecutionReport }) {
  const okCount = report.results.filter((r) => r.status === "success").length
  const errCount = report.results.filter((r) => r.status === "error").length
  const cancelCount = report.results.filter(
    (r) => r.status === "cancelled",
  ).length
  const skipCount = report.results.filter((r) => r.status === "skipped").length

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="font-semibold text-foreground">执行结果</span>
        <SummaryPill tone="success" label={`${okCount} 成功`} />
        {errCount > 0 && (
          <SummaryPill tone="error" label={`${errCount} 失败`} />
        )}
        {cancelCount > 0 && (
          <SummaryPill tone="muted" label={`${cancelCount} 已取消`} />
        )}
        {skipCount > 0 && (
          <SummaryPill tone="muted" label={`${skipCount} 已跳过`} />
        )}
      </div>
      <ol className="space-y-1">
        {report.results.map((r, i) => (
          <ResultRow key={i} index={i} result={r} />
        ))}
      </ol>
    </div>
  )
}

function SummaryPill({
  tone,
  label,
}: {
  tone: "success" | "error" | "muted"
  label: string
}) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        tone === "success" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  )
}

function ResultRow({
  index,
  result,
}: {
  index: number
  result: ExecResultBase
}) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!result.detail && result.detail.length > 0

  return (
    <li className="rounded-md border bg-background/60">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => hasDetail && setOpen((v) => !v)}
          disabled={!hasDetail}
          className={cn(
            "text-muted-foreground",
            hasDetail && "hover:text-foreground",
            !hasDetail && "opacity-30",
          )}
          aria-label={open ? "折叠" : "展开"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <StatusIcon status={result.status} />
        <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
          #{index + 1}
        </span>
        <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] font-medium">
          {result.kind}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px]",
            result.status === "error" && "text-destructive",
            result.status === "success" && "text-foreground",
            (result.status === "cancelled" || result.status === "skipped") &&
              "text-muted-foreground",
          )}
        >
          {result.summary}
        </span>
        {result.durationMs > 0 && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {result.durationMs}ms
          </span>
        )}
      </div>
      {result.path && (
        <div className="border-t px-2 py-1 font-mono text-[10.5px] text-muted-foreground break-all">
          {result.path}
        </div>
      )}
      {open && hasDetail && (
        <pre className="max-h-64 overflow-auto border-t bg-muted/40 p-2 font-mono text-[10.5px] leading-snug whitespace-pre-wrap break-all">
          {result.detail}
        </pre>
      )}
    </li>
  )
}

function StatusIcon({ status }: { status: ExecResultBase["status"] }) {
  switch (status) {
    case "success":
      return (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      )
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
    case "cancelled":
      return <SlashSquare className="h-3.5 w-3.5 text-muted-foreground" />
    case "skipped":
      return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
  }
}