import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
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
  SlashSquare,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/store/tab.store"

import type { ExecResultBase, ExecStatus } from "../executor/command-executor"
import type { ParsedCommand } from "../executor/command-parser"
import { buildFilesContext } from "../file-context"

/**
 * 单条指令的展示卡片。
 *
 * 结构:
 *   ┌─ 头部: [徽标] [路径 · copy] [状态点] [耗时]
 *   │
 *   ├─ 主体(按 kind 分):
 *   │    WRITE_FILE  → 前 N 行代码,可展开
 *   │    EDIT_FILE   → 简易 diff:每块 SEARCH 折叠 + REPLACE 高亮
 *   │    DELETE/MOVE/CREATE_DIRECTORY → 无主体
 *   │    REQUEST_*  → 结果作为可折叠代码块
 *   │
 *   └─ 尾部: 错误详情(仅失败时)
 *
 * 状态来源:
 *   - command: 解析结果(必有)
 *   - result:  执行回执(可选)。缺失时视为 pending。
 */

const DEFAULT_PREVIEW_LINES = 12

interface ChangeCardProps {
  command: ParsedCommand
  result?: ExecResultBase
  /** 初始是否展开主体。默认按 kind 决定 */
  defaultOpen?: boolean
}

export function ChangeCard({ command, result, defaultOpen }: ChangeCardProps) {
  const hasBody = commandHasBody(command, result)
  const [open, setOpen] = useState(
    defaultOpen ?? (hasBody ? defaultOpenFor(command.kind) : false),
  )

  const status: ExecStatus | "pending" = result?.status ?? "pending"
  const meta = KIND_META[command.kind]
  const Icon = meta.icon
  const primaryPath = getPrimaryPath(command)

  const [copiedFiles, setCopiedFiles] = useState(false)
  // 仅对 REQUEST_FILE / REQUEST_DIRECTORY_LIST 展示"复制为 files 上下文"
  const canCopyAsFiles =
    command.kind === "REQUEST_FILE" ||
    command.kind === "REQUEST_DIRECTORY_LIST"

  const handleCopyAsFiles = async () => {
    if (!canCopyAsFiles) return
    try {
      // REQUEST_FILE:直接读取该文件
      // REQUEST_DIRECTORY_LIST:递归展开目录下所有文件
      // 两者均通过 buildFilesContext 复用与用户消息一致的 <files> 格式
      const path = "path" in command ? command.path : ""
      if (!path) return
      const ctx = await buildFilesContext([path])
      if (!ctx) return
      await navigator.clipboard.writeText(ctx)
      setCopiedFiles(true)
      window.setTimeout(() => setCopiedFiles(false), 1200)
    } catch {
      // 忽略
    }
  }

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-md border bg-background/60 shadow-sm",
        status === "error" && "border-destructive/40",
        status === "success" && "border-emerald-500/30",
      )}
    >
      {/* 头部 */}
      <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
        <button
          type="button"
          onClick={() => hasBody && setOpen((v) => !v)}
          disabled={!hasBody}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground",
            hasBody && "hover:bg-muted hover:text-foreground",
            !hasBody && "opacity-30",
          )}
          aria-label={open ? "折叠" : "展开"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <span
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            meta.badgeClass,
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>

        <PathDisplay 
          path={primaryPath} 
          openPath={command.kind === "MOVE_PATH" ? command.destination : ("path" in command ? command.path : undefined)} 
        />

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
          <StatusPill status={status} summary={result?.summary} />
          {result?.durationMs != null && result.durationMs > 0 && (
            <span className="tabular-nums text-[10px] text-muted-foreground">
              {result.durationMs}ms
            </span>
          )}
        </div>
      </div>

      {/* 主体 */}
      {hasBody && open && (
        <div className="border-t bg-background/40">
          <CardBody command={command} result={result} />
        </div>
      )}

      {/* 错误详情 */}
      {status === "error" && result?.detail && (
        <div className="border-t bg-destructive/5 px-2 py-1.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
            诊断片段
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] leading-snug text-destructive">
            {result.detail}
          </pre>
        </div>
      )}
    </div>
  )
}

function CardBody({
  command,
  result,
}: {
  command: ParsedCommand
  result?: ExecResultBase
}): ReactNode {
  switch (command.kind) {
    case "WRITE_FILE":
      return <CodePreview text={command.content} language="" />
    case "EDIT_FILE":
      return <EditBlocks edits={command.edits} />
    case "REQUEST_DIRECTORY_LIST":
    case "REQUEST_FILE":
      return (
        <CodePreview
          text={result?.detail ?? "(尚未执行)"}
          language=""
          muted={!result?.detail}
        />
      )
    default:
      return null
  }
}

/**
 * 简易 diff:每个 SEARCH/REPLACE 块
 *   - SEARCH 段默认折叠(点击展开),表示"被替换掉的内容"
 *   - REPLACE 段以浅绿色底常态展示,表示"新内容"
 * 空 SEARCH 视为纯追加,不渲染 SEARCH 段。
 */
function EditBlocks({
  edits,
}: {
  edits: { search: string; replace: string }[]
}) {
  return (
    <div className="space-y-2 p-2">
      {edits.map((e, i) => (
        <EditBlock key={i} index={i} search={e.search} replace={e.replace} />
      ))}
    </div>
  )
}

function EditBlock({
  index,
  search,
  replace,
}: {
  index: number
  search: string
  replace: string
}) {
  const [showSearch, setShowSearch] = useState(false)
  const hasSearch = search.length > 0
  return (
    <div className="rounded border bg-background/60">
      <div className="flex items-center justify-between border-b px-2 py-1 text-[10px] text-muted-foreground">
        <span className="font-mono">块 #{index + 1}</span>
        {hasSearch && (
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="rounded px-1 hover:bg-muted hover:text-foreground"
          >
            {showSearch ? "隐藏原内容" : "查看原内容"}
          </button>
        )}
        {!hasSearch && <span className="italic">纯追加</span>}
      </div>
      {showSearch && hasSearch && (
        <div className="border-b border-dashed">
          <div className="border-b bg-rose-500/5 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            − 原内容
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all bg-rose-500/5 px-2 py-1 font-mono text-[10.5px] leading-snug text-foreground/80">
            {search}
          </pre>
        </div>
      )}
      <div>
        <div className="border-b bg-emerald-500/5 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          + 新内容
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-emerald-500/5 px-2 py-1 font-mono text-[10.5px] leading-snug">
          {replace}
        </pre>
      </div>
    </div>
  )
}

/**
 * 长文本预览:默认展开前 N 行,超出时提供"展开全部/收起"。
 */
function CodePreview({
  text,
  language,
  muted,
}: {
  text: string
  language?: string
  muted?: boolean
}) {
  const lines = text.split("\n")
  const total = lines.length
  const truncated = total > DEFAULT_PREVIEW_LINES
  const [showAll, setShowAll] = useState(false)
  const visible = showAll || !truncated
    ? text
    : lines.slice(0, DEFAULT_PREVIEW_LINES).join("\n")

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
            {showAll
              ? `共 ${total} 行`
              : `已显示前 ${DEFAULT_PREVIEW_LINES} 行 / 共 ${total} 行`}
          </span>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded px-1 hover:bg-muted hover:text-foreground"
          >
            {showAll ? "收起" : "展开全部"}
          </button>
          {language && <span className="font-mono">{language}</span>}
        </div>
      )}
    </div>
  )
}

/** 路径显示:过长时中间省略,hover 显示全路径。支持双击选中文本，按住 Ctrl 单击打开文件 */
function PathDisplay({ path, openPath }: { path: string; openPath?: string }) {
  const openFile = useTabStore((s) => s.openFile)

  const handleClick = (e: React.MouseEvent) => {
    if ((e.ctrlKey || e.metaKey) && openPath) {
      e.preventDefault()
      e.stopPropagation()
      openFile(openPath)
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

function StatusPill({
  status,
  summary,
}: {
  status: ExecStatus | "pending"
  summary?: string
}) {
  const map: Record<
    ExecStatus | "pending",
    { icon: typeof CheckCircle2; label: string; className: string }
  > = {
    pending: {
      icon: Circle,
      label: "待执行",
      className: "text-muted-foreground",
    },
    success: {
      icon: CheckCircle2,
      label: summary ?? "成功",
      className: "text-emerald-600 dark:text-emerald-400",
    },
    error: {
      icon: AlertCircle,
      label: summary ?? "失败",
      className: "text-destructive",
    },
    cancelled: {
      icon: SlashSquare,
      label: summary ?? "已取消",
      className: "text-muted-foreground",
    },
    skipped: {
      icon: MinusCircle,
      label: summary ?? "已跳过",
      className: "text-muted-foreground",
    },
  }
  const it = map[status]
  const Icon = it.icon
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[10.5px] font-medium",
        it.className,
      )}
    >
      {status === "pending" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span className="max-w-[160px] truncate">{it.label}</span>
    </span>
  )
}

function commandHasBody(cmd: ParsedCommand, result?: ExecResultBase): boolean {
  switch (cmd.kind) {
    case "WRITE_FILE":
      return cmd.content.length > 0
    case "EDIT_FILE":
      return cmd.edits.length > 0
    case "REQUEST_DIRECTORY_LIST":
    case "REQUEST_FILE":
      // 结果就绪才有主体
      return !!result?.detail
    default:
      return false
  }
}

function defaultOpenFor(kind: ParsedCommand["kind"]): boolean {
  // 用户偏好:默认展开前 N 行(WRITE/EDIT 视为核心信息)
  return (
    kind === "WRITE_FILE" ||
    kind === "EDIT_FILE" ||
    kind === "REQUEST_DIRECTORY_LIST" ||
    kind === "REQUEST_FILE"
  )
}

function getPrimaryPath(cmd: ParsedCommand): string {
  switch (cmd.kind) {
    case "MOVE_PATH":
      return `${cmd.source} → ${cmd.destination}`
    default:
      return cmd.path
  }
}

interface KindMeta {
  label: string
  icon: typeof FileCode
  badgeClass: string
}

const KIND_META: Record<ParsedCommand["kind"], KindMeta> = {
  WRITE_FILE: {
    label: "写入",
    icon: FilePlus,
    badgeClass:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20",
  },
  EDIT_FILE: {
    label: "编辑",
    icon: FileEdit,
    badgeClass:
      "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20",
  },
  DELETE_FILE: {
    label: "删除",
    icon: FileMinus,
    badgeClass:
      "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20",
  },
  MOVE_PATH: {
    label: "移动",
    icon: MoveRight,
    badgeClass:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20",
  },
  CREATE_DIRECTORY: {
    label: "建目录",
    icon: FolderPlus,
    badgeClass:
      "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/20",
  },
  REQUEST_DIRECTORY_LIST: {
    label: "列目录",
    icon: FolderTree,
    badgeClass:
      "bg-muted text-foreground/80 ring-1 ring-border",
  },
  REQUEST_FILE: {
    label: "读文件",
    icon: FileText,
    badgeClass:
      "bg-muted text-foreground/80 ring-1 ring-border",
  },
}