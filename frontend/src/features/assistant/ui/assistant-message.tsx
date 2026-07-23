import { useMemo, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { FragmentService } from "@/../bindings/prompttool/internal/services/conversation"
import type { MessageFragmentDTO } from "@/../bindings/prompttool/internal/services/conversation/models"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { RichEditor } from "@/shared/rich-editor"
import { isApplyableStatus } from "@/entities/exec-command"

import { FragmentCard } from "./fragment-card"

interface AssistantMessageProps {
  /** 消息 id 用来驱动"全部应用"。前端持有的 temp-id 会是字符串,那种情况忽略按钮。 */
  messageId?: number | string
  fragments?: MessageFragmentDTO[]
  /**
   * 展示模式:
   *  - "all"      : 完整渲染 TEXT + 指令片段(默认)
   *  - "commands" : 只渲染指令片段,过滤掉 TEXT 段落
   */
  viewMode?: "all" | "commands"
}

/**
 * AI 消息渲染(纯 fragments 驱动,后端不再回传 content):
 *   1. 无可渲染片段 → 空占位。
 *   2. 按 orderIndex 升序遍历 fragments:
 *      - TEXT / PARSE_ERROR 片段的 before 作为文本段渲染为 markdown
 *      - 指令片段按 (rawStart, rawEnd) 相邻合并(仅 EDIT_BLOCK)成组渲染为卡片
 *   3. 顶部聚合条只统计"指令片段",TEXT 不计入变更单。
 */
export function AssistantMessage({
                                   messageId,
                                   fragments,
                                   viewMode = "all",
                                 }: AssistantMessageProps) {
  const frags = fragments ?? []
  const allSegments = useMemo(() => buildSegments(frags), [frags])
  const segments = useMemo(
      () =>
          viewMode === "commands"
              ? allSegments.filter((s) => s.type === "group")
              : allSegments,
      [allSegments, viewMode],
  )
  const actionableFrags = useMemo(
      () => frags.filter((f) => f.kind !== "TEXT"),
      [frags],
  )

  if (segments.length === 0) {
    if (viewMode === "commands") {
      return (
          <div className="min-w-0 max-w-none py-1 text-[11.5px] italic text-muted-foreground">
            此消息不包含任何指令片段。
          </div>
      )
    }
    return <div className="min-w-0 max-w-none" />
  }

  const applyableCount = actionableFrags.filter((f) =>
      isApplyableStatus(f.status),
  ).length
  const hasActionable = actionableFrags.length > 0

  return (
      <div className="min-w-0 max-w-none">
        {hasActionable && (
            <TopBar
                messageId={typeof messageId === "number" ? messageId : undefined}
                fragments={actionableFrags}
                applyableCount={applyableCount}
            />
        )}
        {segments.map((seg) => {
          if (seg.type === "text") {
            if (seg.value.trim().length === 0) return null
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
          return <GroupView key={seg.key} group={seg.group} />
        })}
      </div>
  )
}

type Segment =
    | { type: "text"; value: string; key: string }
    | { type: "group"; group: FragmentGroup; key: string }

/**
 * 按 orderIndex 遍历 fragments,把 TEXT 与指令组交错串起来。
 * 相邻的 EDIT_BLOCK(相同 rawStart+rawEnd)合并到同一组以复用"编辑 <path>"卡壳。
 */
function buildSegments(fragments: MessageFragmentDTO[]): Segment[] {
  if (fragments.length === 0) return []
  const sorted = [...fragments].sort((a, b) => a.orderIndex - b.orderIndex)
  const segments: Segment[] = []
  let textBuf = ""
  let textKey = 0

  const flushText = () => {
    if (textBuf.length === 0) return
    segments.push({ type: "text", value: textBuf, key: `t-${textKey++}` })
    textBuf = ""
  }

  for (const f of sorted) {
    if (f.kind === "TEXT") {
      textBuf += f.before
      continue
    }
    flushText()
    const last = segments[segments.length - 1]
    if (
        last &&
        last.type === "group" &&
        last.group.headerKind === "EDIT_BLOCK" &&
        f.kind === "EDIT_BLOCK" &&
        last.group.rawStart === f.rawStart &&
        last.group.rawEnd === f.rawEnd
    ) {
      last.group.fragments.push(f)
      continue
    }
    segments.push({
      type: "group",
      key: `g-${f.id}`,
      group: {
        rawStart: f.rawStart,
        rawEnd: f.rawEnd,
        headerPath: headerPathOf(f),
        headerKind: f.kind,
        fragments: [f],
      },
    })
  }
  flushText()
  return segments
}

// ---------- Fragment 分组 ----------

interface FragmentGroup {
  rawStart: number
  rawEnd: number
  /** 分组头部展示的路径:非 MOVE_PATH 用第一个 fragment 的 path,MOVE_PATH 用 source→destination。 */
  headerPath: string
  headerKind: string
  fragments: MessageFragmentDTO[]
}

function headerPathOf(f: MessageFragmentDTO): string {
  if (f.kind === "MOVE_PATH") return `${f.path} → ${f.destination}`
  return f.path
}

// ---------- 视图 ----------

function GroupView({ group }: { group: FragmentGroup }) {
  // 单卡片场景:直接铺开,无外框。
  if (group.fragments.length === 1) {
    return <FragmentCard fragment={group.fragments[0]} />
  }
  // 多 EDIT_BLOCK 场景:外壳给出统一"编辑 <path>"标题。
  return (
    <div className="my-2 rounded-md border bg-background/40">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1 text-[11px]">
        <span className="font-semibold text-foreground">编辑</span>
        <span className="min-w-0 flex-1 truncate font-mono text-foreground/80" dir="rtl" style={{ textAlign: "left" }}>
          {group.headerPath}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {group.fragments.length} 块
        </span>
      </div>
      <div className="space-y-2 p-2">
        {group.fragments.map((f) => (
          <FragmentCard key={f.id} fragment={f} showKindBadge={false} />
        ))}
      </div>
    </div>
  )
}

function TopBar({
  messageId,
  fragments,
  applyableCount,
}: {
  messageId?: number
  fragments: MessageFragmentDTO[]
  applyableCount: number
}) {
  const [applying, setApplying] = useState(false)

  const counts = {
    total: fragments.length,
    applied: fragments.filter((f) => f.status === "applied" || f.status === "resolved").length,
    failed: fragments.filter((f) => f.status === "match_failed").length,
    pending: fragments.filter((f) => f.status === "pending").length,
    ignored: fragments.filter((f) => f.status === "ignored").length,
    parseError: fragments.filter((f) => f.status === "parse_error").length,
  }

  const busy = counts.pending > 0 && counts.applied + counts.failed + counts.ignored < counts.total - counts.parseError

  const handleApplyAll = async () => {
    if (messageId == null || applyableCount === 0 || applying) return
    setApplying(true)
    try {
      await FragmentService.ApplyFragments({ messageId, fragmentIds: [] })
    } catch (err) {
      console.error("[assistant-message] apply-all failed", err)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px]">
      <span className="font-semibold text-foreground">变更单</span>
      <Pill tone="muted" label={`${counts.total} 条`} />
      {counts.applied > 0 && <Pill tone="success" label={`${counts.applied} 已应用`} />}
      {counts.failed > 0 && <Pill tone="error" label={`${counts.failed} 失败`} />}
      {counts.pending > 0 && <Pill tone="pending" label={`${counts.pending} 待应用`} />}
      {counts.ignored > 0 && <Pill tone="muted" label={`${counts.ignored} 已忽略`} />}
      {counts.parseError > 0 && <Pill tone="error" label={`${counts.parseError} 解析错误`} />}
      {busy && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          执行中
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {counts.applied === counts.total - counts.parseError - counts.ignored && applyableCount === 0 && counts.applied > 0 && (
          <span className="flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            全部就绪
          </span>
        )}
        {applyableCount > 0 && messageId != null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={applying}
            onClick={handleApplyAll}
            className="h-6 gap-1 px-2 text-[10px]"
          >
            {applying ? "应用中…" : `应用 ${applyableCount} 条`}
          </Button>
        )}
      </div>
    </div>
  )
}

function Pill({
  tone,
  label,
}: {
  tone: "success" | "error" | "muted" | "pending"
  label: string
}) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        tone === "success" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "pending" && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
      )}
    >
      {label}
    </span>
  )
}
