import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  FileCode,
  FileEdit,
  FileMinus,
  FilePlus,
  FileText,
  FolderPlus,
  FolderTree,
  Loader2,
  MinusCircle,
  MoveRight,
  Package,
  Undo2,
} from "lucide-react"
import { useEffect, useState } from "react"

import { FragmentService } from "@/../bindings/prompttool/internal/services/conversation"
import type { MessageFragmentDTO } from "@/../bindings/prompttool/internal/services/conversation/models"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { requestOpenFile } from "@/shared/model"

import { buildFilesContext } from "@/lib/file-context"

interface FragmentCardProps {
  fragment: MessageFragmentDTO
  /** 位于 EDIT_FILE 分组内时(多块场景)隐藏 kind 徽标以减少视觉噪声 */
  showKindBadge?: boolean
}

/**
 * 单条 fragment 的展示卡片。UI 生命周期:
 *   - pending / match_failed:显示"应用"按钮;后者附错因和内嵌编辑器,支持 Save & Retry
 *   - applied / resolved: 折叠为完成态,展开可回看 diff / 详情
 *   - ignored:淡出,附"取消忽略"按钮
 *   - parse_error:红色错误卡,附原文/错因
 *
 * REQUEST_FILE / REQUEST_DIRECTORY_LIST 的读取结果落在 fragment.after,不需要用户"应用"。
 */
export function FragmentCard({ fragment, showKindBadge = true }: FragmentCardProps) {
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(() => defaultOpenFor(fragment))

  useEffect(() => {
    // status 变化时,把默认展开态跟着算一次(应用完成后自动收起)。
    setExpanded(defaultOpenFor(fragment))
  }, [fragment.status, fragment.kind])

  const kindMeta = KIND_META[fragment.kind] ?? KIND_META.PARSE_ERROR
  const Icon = kindMeta.icon
  const status = fragment.status
  const hasBody = fragmentHasBody(fragment)

  const primaryPath = fragment.kind === "MOVE_PATH"
    ? `${fragment.path} → ${fragment.destination}`
    : fragment.path

  const openPath = fragment.kind === "MOVE_PATH" ? fragment.destination : fragment.path
  const canCopyAsFiles =
    fragment.kind === "REQUEST_FILE" || fragment.kind === "REQUEST_DIRECTORY_LIST"
  const [copiedFiles, setCopiedFiles] = useState(false)

  const handleCopyAsFiles = async () => {
    if (!canCopyAsFiles || !fragment.path) return
    try {
      const ctx = await buildFilesContext([fragment.path])
      if (!ctx) return
      await navigator.clipboard.writeText(ctx)
      setCopiedFiles(true)
      window.setTimeout(() => setCopiedFiles(false), 1200)
    } catch {
      // ignore
    }
  }

  const handleApply = async () => {
    if (busy) return
    setBusy(true)
    try {
      await FragmentService.ApplyFragments({
        messageId: fragment.messageId,
        fragmentIds: [fragment.id],
      })
    } catch (err) {
      console.error("[fragment-card] apply failed", err)
    } finally {
      setBusy(false)
    }
  }

  const handleIgnore = async () => {
    if (busy) return
    setBusy(true)
    try {
      await FragmentService.SetFragmentStatus({
        fragmentId: fragment.id,
        status: "ignored",
      })
    } catch (err) {
      console.error("[fragment-card] ignore failed", err)
    } finally {
      setBusy(false)
    }
  }

  const handleUnignore = async () => {
    if (busy) return
    setBusy(true)
    try {
      await FragmentService.SetFragmentStatus({
        fragmentId: fragment.id,
        status: "pending",
      })
    } catch (err) {
      console.error("[fragment-card] unignore failed", err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-md border bg-background/60 shadow-sm",
        status === "match_failed" && "border-destructive/40",
        status === "parse_error" && "border-destructive/40",
        (status === "applied" || status === "resolved") && "border-emerald-500/30",
        status === "ignored" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
        <button
          type="button"
          onClick={() => hasBody && setExpanded((v) => !v)}
          disabled={!hasBody}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground",
            hasBody && "hover:bg-muted hover:text-foreground",
            !hasBody && "opacity-30",
          )}
          aria-label={expanded ? "折叠" : "展开"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {showKindBadge && (
          <span
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              kindMeta.badgeClass,
            )}
          >
            <Icon className="h-3 w-3" />
            {kindMeta.label}
          </span>
        )}

        <PathDisplay path={primaryPath} openPath={openPath} />

        {canCopyAsFiles && (
          <button
            type="button"
            onClick={handleCopyAsFiles}
            title="复制为 <files> 上下文"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {copiedFiles ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : (
              <Package className="h-3 w-3" />
            )}
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <StatusPill status={status} />
          <ActionButtons
            status={status}
            busy={busy}
            onApply={handleApply}
            onIgnore={handleIgnore}
            onUnignore={handleUnignore}
          />
        </div>
      </div>

      {status === "match_failed" && fragment.matchReason && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-2 py-1.5">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
            <AlertTriangle className="h-3 w-3" />
            匹配失败
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] leading-snug text-destructive">
            {fragment.matchReason}
          </pre>
        </div>
      )}

      {status === "parse_error" && fragment.matchReason && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-2 py-1.5">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
            <AlertCircle className="h-3 w-3" />
            解析错误
          </div>
          <div className="whitespace-pre-wrap font-mono text-[10.5px] leading-snug text-destructive">
            {fragment.matchReason}
          </div>
        </div>
      )}

      {expanded && hasBody && (
        <div className="border-t bg-background/40">
          <CardBody fragment={fragment} />
        </div>
      )}
    </div>
  )
}

// ---------- 主体 ----------

function CardBody({ fragment }: { fragment: MessageFragmentDTO }) {
  const editable = fragment.status === "match_failed"

  switch (fragment.kind) {
    case "WRITE_FILE":
      if (editable) return <EditableFragment fragment={fragment} showBefore={false} />
      return <CodePreview text={fragment.after} />
    case "EDIT_BLOCK":
      if (editable) return <EditableFragment fragment={fragment} showBefore={true} />
      return <DiffPreview before={fragment.before} after={fragment.after} />
    case "REQUEST_FILE":
    case "REQUEST_DIRECTORY_LIST":
      return (
        <CodePreview
          text={fragment.after || "(尚未读取)"}
          muted={!fragment.after}
        />
      )
    default:
      return null
  }
}

/**
 * 匹配失败时的内嵌编辑器:
 * - EDIT_BLOCK:SEARCH + REPLACE 双 textarea + Save & Retry
 * - WRITE_FILE:REPLACE(=文件内容)单 textarea
 * 提交时把改动 PATCH 到后端,后端会自动把 status 复位为 pending,前端可再点应用。
 * 这里 Save & Retry 一步完成:先 UpdateFragment,再 ApplyFragments。
 */
function EditableFragment({
  fragment,
  showBefore,
}: {
  fragment: MessageFragmentDTO
  showBefore: boolean
}) {
  const [before, setBefore] = useState(fragment.before)
  const [after, setAfter] = useState(fragment.after)
  const [path, setPath] = useState(fragment.path)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setBefore(fragment.before)
    setAfter(fragment.after)
    setPath(fragment.path)
  }, [fragment.before, fragment.after, fragment.path])

  const dirty =
    before !== fragment.before || after !== fragment.after || path !== fragment.path

  const handleSaveRetry = async () => {
    setSaving(true)
    try {
      if (dirty) {
        await FragmentService.UpdateFragment({
          fragmentId: fragment.id,
          before: showBefore ? before : null,
          after,
          path: path !== fragment.path ? path : null,
          destination: null,
        })
      }
      await FragmentService.ApplyFragments({
        messageId: fragment.messageId,
        fragmentIds: [fragment.id],
      })
    } catch (err) {
      console.error("[fragment-card] save-retry failed", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
        <span className="shrink-0">目标文件</span>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 font-mono text-[10.5px]"
        />
      </div>
      {showBefore && (
        <div>
          <div className="mb-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            − SEARCH
          </div>
          <textarea
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            className="w-full min-h-24 rounded border bg-background p-1.5 font-mono text-[10.5px]"
          />
        </div>
      )}
      <div>
        <div className="mb-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          + {showBefore ? "REPLACE" : "内容"}
        </div>
        <textarea
          value={after}
          onChange={(e) => setAfter(e.target.value)}
          className="w-full min-h-32 rounded border bg-background p-1.5 font-mono text-[10.5px]"
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={handleSaveRetry}
          className="h-7 px-3 text-[11px]"
        >
          {saving ? "重试中…" : dirty ? "保存并重试" : "重试"}
        </Button>
      </div>
    </div>
  )
}

function DiffPreview({ before, after }: { before: string; after: string }) {
  const hasBefore = before.length > 0
  return (
    <div className="space-y-2 p-2">
      {hasBefore && (
        <div className="rounded border-b border-dashed">
          <div className="border-b bg-rose-500/5 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            − SEARCH
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all bg-rose-500/5 px-2 py-1 font-mono text-[10.5px] leading-snug text-foreground/80">
            {before}
          </pre>
        </div>
      )}
      <div className="rounded">
        <div className="border-b bg-emerald-500/5 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          + REPLACE
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-emerald-500/5 px-2 py-1 font-mono text-[10.5px] leading-snug">
          {after}
        </pre>
      </div>
    </div>
  )
}

const PREVIEW_LINES = 12
function CodePreview({ text, muted }: { text: string; muted?: boolean }) {
  const lines = text.split("\n")
  const total = lines.length
  const truncated = total > PREVIEW_LINES
  const [showAll, setShowAll] = useState(false)
  const visible = showAll || !truncated ? text : lines.slice(0, PREVIEW_LINES).join("\n")
  return (
    <div>
      <pre
        className={cn(
          "max-h-96 overflow-auto whitespace-pre-wrap break-all px-2 py-1.5 font-mono text-[10.5px] leading-snug",
          muted && "italic text-muted-foreground",
        )}
      >
        {visible}
      </pre>
      {truncated && (
        <div className="flex items-center justify-between border-t bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
          <span>
            {showAll ? `共 ${total} 行` : `已显示前 ${PREVIEW_LINES} 行 / 共 ${total} 行`}
          </span>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded px-1 hover:bg-muted hover:text-foreground"
          >
            {showAll ? "收起" : "展开全部"}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- 通用小组件 ----------

function PathDisplay({ path, openPath }: { path: string; openPath?: string }) {
  const handleClick = (e: React.MouseEvent) => {
    if ((e.ctrlKey || e.metaKey) && openPath) {
      e.preventDefault()
      e.stopPropagation()
      requestOpenFile(openPath)
    }
  }
  return (
    <span
      title={path + (openPath ? "\n(Ctrl+Click 打开文件)" : "")}
      onClick={handleClick}
      className="min-w-0 flex-1 cursor-text select-text truncate font-mono text-[11px] text-foreground/90 hover:underline hover:decoration-muted-foreground hover:underline-offset-2"
      dir="rtl"
      style={{ textAlign: "left" }}
    >
      {path}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<
    string,
    { icon: typeof CheckCircle2; label: string; className: string; spin?: boolean }
  > = {
    pending: {
      icon: Circle,
      label: "待应用",
      className: "text-muted-foreground",
    },
    applied: {
      icon: CheckCircle2,
      label: "已应用",
      className: "text-emerald-600 dark:text-emerald-400",
    },
    resolved: {
      icon: Eye,
      label: "已读取",
      className: "text-emerald-600 dark:text-emerald-400",
    },
    match_failed: {
      icon: AlertCircle,
      label: "匹配失败",
      className: "text-destructive",
    },
    ignored: {
      icon: MinusCircle,
      label: "已忽略",
      className: "text-muted-foreground",
    },
    parse_error: {
      icon: AlertCircle,
      label: "解析错误",
      className: "text-destructive",
    },
  }
  const it = map[status] ?? map.pending
  const Icon = it.icon
  return (
    <span className={cn("flex items-center gap-1 text-[10.5px] font-medium", it.className)}>
      {status === "pending" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span>{it.label}</span>
    </span>
  )
}

function ActionButtons({
  status,
  busy,
  onApply,
  onIgnore,
  onUnignore,
}: {
  status: string
  busy: boolean
  onApply: () => void
  onIgnore: () => void
  onUnignore: () => void
}) {
  if (status === "pending") {
    return (
      <>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onApply} className="h-5 px-1.5 text-[10px]">
          应用
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onIgnore} className="h-5 px-1 text-[10px] text-muted-foreground">
          忽略
        </Button>
      </>
    )
  }
  if (status === "match_failed") {
    return (
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onIgnore} className="h-5 px-1 text-[10px] text-muted-foreground">
        忽略
      </Button>
    )
  }
  if (status === "ignored") {
    return (
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onUnignore} className="h-5 px-1 text-[10px]">
        取消忽略
      </Button>
    )
  }
  if (status === "applied") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Undo2 className="h-3 w-3" />
        可用消息头撤销
      </span>
    )
  }
  return null
}

function fragmentHasBody(f: MessageFragmentDTO): boolean {
  switch (f.kind) {
    case "WRITE_FILE":
      return f.after.length > 0
    case "EDIT_BLOCK":
      return f.before.length > 0 || f.after.length > 0
    case "REQUEST_FILE":
    case "REQUEST_DIRECTORY_LIST":
      return f.after.length > 0
    default:
      return false
  }
}

function defaultOpenFor(f: MessageFragmentDTO): boolean {
  if (f.status === "applied" || f.status === "resolved" || f.status === "ignored") return false
  if (f.status === "match_failed") return true
  if (f.kind === "REQUEST_FILE" || f.kind === "REQUEST_DIRECTORY_LIST") return false
  return f.kind === "WRITE_FILE" || f.kind === "EDIT_BLOCK"
}

interface KindMeta {
  label: string
  icon: typeof FileCode
  badgeClass: string
}

const KIND_META: Record<string, KindMeta> = {
  WRITE_FILE: {
    label: "写入",
    icon: FilePlus,
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20",
  },
  EDIT_BLOCK: {
    label: "编辑",
    icon: FileEdit,
    badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20",
  },
  DELETE_FILE: {
    label: "删除",
    icon: FileMinus,
    badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20",
  },
  MOVE_PATH: {
    label: "移动",
    icon: MoveRight,
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20",
  },
  CREATE_DIRECTORY: {
    label: "建目录",
    icon: FolderPlus,
    badgeClass: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/20",
  },
  REQUEST_DIRECTORY_LIST: {
    label: "列目录",
    icon: FolderTree,
    badgeClass: "bg-muted text-foreground/80 ring-1 ring-border",
  },
  REQUEST_FILE: {
    label: "读文件",
    icon: FileText,
    badgeClass: "bg-muted text-foreground/80 ring-1 ring-border",
  },
  PARSE_ERROR: {
    label: "错误",
    icon: AlertCircle,
    badgeClass: "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
  },
}
