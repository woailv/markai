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
  /** 消息 id 用来驱动"全部应用"。前端持有的 temp-id 会是字符串,那种情况按无 fragments 处理。 */
  messageId?: number | string
  content: string
  fragments?: MessageFragmentDTO[]
}

/**
 * AI 消息渲染:
 *   1. 无 fragments → 纯 markdown。
 *   2. 有 fragments → 按 rawStart/rawEnd 把原文切成"文本段 / 片段组"。
 *      同一 rawStart+rawEnd 的多个 EDIT_BLOCK 归成一组,共享一个"编辑 <path>"卡壳。
 *   3. 顶部聚合条呈现整体状态,含"应用全部可用片段"按钮。
 */
export function AssistantMessage({
  messageId,
  content,
  fragments,
}: AssistantMessageProps) {
  const frags = fragments ?? []
  const groups = useMemo(() => groupFragments(frags), [frags])

  if (frags.length === 0 || groups.length === 0) {
    return (
      <div className="min-w-0 max-w-none">
        <RichEditor
          value={content}
          mode="readonly"
          markdown
          fileTokens={{ enabled: true }}
          templateTokens={{ enabled: true }}
          className="min-w-0 max-w-none"
        />
      </div>
    )
  }

  const applyableCount = frags.filter((f) => isApplyableStatus(f.status)).length

  // 切片:相邻 group 之间是文本段。
  const segments: Array<
    | { type: "text"; value: string; key: string }
    | { type: "group"; group: FragmentGroup; key: string }
  > = []
  let cursor = 0
  groups.forEach((g, i) => {
    if (g.rawStart > cursor) {
      const chunk = content.slice(cursor, g.rawStart)
      if (chunk.trim().length > 0) {
        segments.push({ type: "text", value: chunk, key: `t-${i}` })
      }
    }
    segments.push({ type: "group", group: g, key: `g-${i}` })
    cursor = g.rawEnd
  })
  if (cursor < content.length) {
    const tail = content.slice(cursor)
    if (tail.trim().length > 0) {
      segments.push({ type: "text", value: tail, key: "t-tail" })
    }
  }

  return (
    <div className="min-w-0 max-w-none">
      <TopBar
        messageId={typeof messageId === "number" ? messageId : undefined}
        fragments={frags}
        applyableCount={applyableCount}
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
        return <GroupView key={seg.key} group={seg.group} />
      })}
    </div>
  )
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

/**
 * 把 fragments 按其原文 rawRange 分组:
 * - 同一 EDIT_FILE 标签展开出的多个 EDIT_BLOCK 共享 (rawStart, rawEnd) → 一组
 * - 其他每条 fragment 自成一组
 * 保序:按 order_index 升序。
 */
function groupFragments(fragments: MessageFragmentDTO[]): FragmentGroup[] {
  if (fragments.length === 0) return []
  const sorted = [...fragments].sort((a, b) => a.orderIndex - b.orderIndex)
  const groups: FragmentGroup[] = []
  for (const f of sorted) {
    const last = groups[groups.length - 1]
    if (
      last &&
      last.rawStart === f.rawStart &&
      last.rawEnd === f.rawEnd &&
      last.headerKind === f.kind &&
      f.kind === "EDIT_BLOCK"
    ) {
      last.fragments.push(f)
      continue
    }
    groups.push({
      rawStart: f.rawStart,
      rawEnd: f.rawEnd,
      headerPath: headerPathOf(f),
      headerKind: f.kind,
      fragments: [f],
    })
  }
  return groups
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
