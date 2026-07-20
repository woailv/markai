import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MinusCircle,
  SlashSquare,
} from "lucide-react"
import { useEffect, useState } from "react"

import { SnapshotService } from "@/../bindings/prompttool/internal/services/snapshot"
import type { BatchStatus } from "@/../bindings/prompttool/internal/services/snapshot/models"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { confirmDestructive } from "@/shared/ui"

import type { ExecResultBase, ExecutionReport } from "./types"

/**
 * 执行状态占位视图。用于消息气泡内呈现"正在执行 N 条指令…"。
 */
export function ExecStatusView({ pending }: { pending: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      正在执行 {pending} 条指令…
    </div>
  )
}

/**
 * 执行回执视图。展示每条命令的状态、耗时,并支持批次撤销。
 * 撤销走 SnapshotService,通过 shared 的 confirmDestructive 弹出二次确认。
 */
export function ExecReportView({ report }: { report: ExecutionReport }) {
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null)
  const [undoing, setUndoing] = useState(false)

  useEffect(() => {
    if (report.batchId) {
      SnapshotService.Status(report.batchId).then(setBatchStatus).catch(console.error)
    }
  }, [report.batchId])

  const handleUndo = async () => {
    if (!report.batchId || !batchStatus || undoing) return
    if (batchStatus.undoneAt) return

    let desc = "确认撤销此批次修改？将还原所有涉及的文件到执行前的状态。"
    if (batchStatus.staleWarning) {
      desc = "警告：此批次中的某些文件在此后又被修改过。撤销将覆盖那些较新的修改，确认继续？"
    }

    const ok = await confirmDestructive({
      title: "撤销文件修改",
      description: desc,
      destructiveLabel: "确认撤销",
    })
    if (!ok) return

    setUndoing(true)
    try {
      await SnapshotService.Undo(report.batchId)
      const newStatus = await SnapshotService.Status(report.batchId)
      setBatchStatus(newStatus)
    } catch (err) {
      alert(`撤销失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUndoing(false)
    }
  }

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
        {report.batchId && report.batchId > 0 && batchStatus && (
          <div className="ml-auto flex items-center gap-2">
            {batchStatus.undoneAt ? (
              <span className="text-[10px] text-muted-foreground line-through">已撤销修改</span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={undoing}
                onClick={handleUndo}
                className={cn(
                  "h-6 px-2 text-[10px]",
                  batchStatus.staleWarning &&
                    "border-amber-500/50 text-amber-600 dark:text-amber-400",
                )}
              >
                {undoing
                  ? "撤销中..."
                  : batchStatus.staleWarning
                    ? "撤销(有覆盖风险)"
                    : "撤销修改"}
              </Button>
            )}
          </div>
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
