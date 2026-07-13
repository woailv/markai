import { AlertTriangle, Loader2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { ExecResultBase } from "../executor/command-executor"
import { useBatchStatus } from "../executor/use-batch-status"

interface BatchSummaryProps {
  totalCommands: number
  results?: ExecResultBase[]
  batchId?: number
  pending?: boolean
}

/**
 * 顶部汇总条:统计各状态数量 + 撤销入口。
 * pending=true 时展示"执行中"状态,不显示统计数字。
 */
export function BatchSummary({
  totalCommands,
  results,
  batchId,
  pending,
}: BatchSummaryProps) {
  const okCount = results?.filter((r) => r.status === "success").length ?? 0
  const errCount = results?.filter((r) => r.status === "error").length ?? 0
  const cancelCount =
    results?.filter((r) => r.status === "cancelled").length ?? 0
  const skipCount = results?.filter((r) => r.status === "skipped").length ?? 0
  const doneCount = results?.length ?? 0

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px]">
      <span className="font-semibold text-foreground">
        {pending ? "执行中" : "变更单"}
      </span>

      {pending ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {doneCount}/{totalCommands}
        </span>
      ) : (
        <>
          <Pill tone="muted" label={`${totalCommands} 条指令`} />
          {okCount > 0 && (
            <Pill tone="success" label={`${okCount} 成功`} />
          )}
          {errCount > 0 && <Pill tone="error" label={`${errCount} 失败`} />}
          {cancelCount > 0 && (
            <Pill tone="muted" label={`${cancelCount} 已取消`} />
          )}
          {skipCount > 0 && (
            <Pill tone="muted" label={`${skipCount} 已跳过`} />
          )}
        </>
      )}

      {batchId != null && batchId > 0 && !pending && (
        <div className="ml-auto">
          <UndoButton batchId={batchId} />
        </div>
      )}
    </div>
  )
}

function UndoButton({ batchId }: { batchId: number }) {
  const { status, undoing, undo } = useBatchStatus(batchId)
  if (!status) return null
  if (status.undoneAt) {
    return (
      <span className="text-[10px] text-muted-foreground line-through">
        已撤销修改
      </span>
    )
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={undoing}
      onClick={undo}
      className={cn(
        "h-6 gap-1 px-2 text-[10px]",
        status.staleWarning &&
          "border-amber-500/50 text-amber-600 dark:text-amber-400",
      )}
    >
      {status.staleWarning ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <Undo2 className="h-3 w-3" />
      )}
      {undoing
        ? "撤销中…"
        : status.staleWarning
          ? "撤销(有覆盖风险)"
          : "撤销修改"}
    </Button>
  )
}

function Pill({
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
        tone === "success" &&
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  )
}