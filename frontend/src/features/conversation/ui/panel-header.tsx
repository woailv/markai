import { MessagesSquare, Pencil, Plus } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/conversation/models"
import { cn } from "@/lib/utils"

import { HistoryPopover } from "./history-popover"

interface PanelHeaderProps {
  title: string
  conversations: ConversationSummary[]
  activeConvId: number | null

  onNewConversation: () => void
  onSelectConversation: (id: number) => void
  onDeleteConversation: (id: number) => void
  onRenameConversation: (id: number, newTitle: string) => void
  onTogglePinConversation: (id: number, pinned: boolean) => void
  onClearAllConversations: () => void
}

/**
 * ChatPanel 顶栏。承载当前会话标题 + 历史/模板/新建/折叠工具按钮。
 * 参照主流 AI 编辑器(Zed / Cursor)右侧 AI 面板的顶部工具栏形态。
 */
export function PanelHeader({
  title,
  conversations,
  activeConvId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onTogglePinConversation,
  onClearAllConversations,
}: PanelHeaderProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-muted/30 px-2">
      <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <EditableTitle
        title={title}
        editable={activeConvId != null}
        onCommit={
          activeConvId != null
            ? (newTitle) => onRenameConversation(activeConvId, newTitle)
            : undefined
        }
      />

      <div className="flex shrink-0 items-center gap-0.5">
        <HistoryPopover
          conversations={conversations}
          activeId={activeConvId}
          onSelect={onSelectConversation}
          onNew={onNewConversation}
          onDelete={onDeleteConversation}
          onRename={onRenameConversation}
          onTogglePin={onTogglePinConversation}
          onClearAll={onClearAllConversations}
        >
          <ToolbarButton title="会话历史">
            <MessagesSquare className="h-3.5 w-3.5" />
          </ToolbarButton>
        </HistoryPopover>

        <ToolbarButton title="新建会话" onClick={onNewConversation}>
          <Plus className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
    </div>
  )
}

/**
 * 顶栏会话标题。存在激活会话时支持点击内联编辑:
 *  - Enter / 失焦提交;Esc 取消;空标题不提交,还原显示;
 *  - 尚无激活会话(未发出首条消息)时只读,提示先开始对话。
 */
function EditableTitle({
  title,
  editable,
  onCommit,
}: {
  title: string
  editable: boolean
  onCommit?: (newTitle: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  // 提交(失焦/回车)只执行一次,避免 Enter → blur 重复触发;也用于屏蔽提交后的 blur 回调
  const doneRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 切换/删除会话时退出编辑态,避免编辑状态残留到新标题上
  useEffect(() => {
    setEditing(false)
  }, [editable, title])

  const startEdit = () => {
    if (!editable) return
    doneRef.current = false
    setDraft(title)
    setEditing(true)
  }

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [editing])

  const cancel = () => setEditing(false)

  const commit = () => {
    if (doneRef.current) return
    doneRef.current = true
    setEditing(false)
    const next = draft.trim()
    if (!next || next === title) return
    onCommit?.(next)
  }

  if (!editable) {
    return (
      <span
        className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground"
        title={title || "新会话"}
      >
        {title || "新会话"}
      </span>
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        title="点击修改会话名称"
        className={cn(
          "group/title flex min-w-0 flex-1 items-center gap-1 rounded border border-transparent px-1 text-left",
          "hover:border-border hover:bg-muted/60",
        )}
      >
        <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
          {title || "新会话"}
        </span>
        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-70" />
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        } else if (e.key === "Escape") {
          e.preventDefault()
          cancel()
        }
        e.stopPropagation()
      }}
      onBlur={() => {
        if (!doneRef.current) commit()
      }}
      placeholder="输入会话名称"
      spellCheck={false}
      autoComplete="off"
      // 与历史搜索框等输入控件保持一致的样式;固定高度避免空内容时塌陷成一条线
      className={cn(
        "h-6 min-w-0 flex-1 rounded-md border bg-background px-1.5 text-[12px] font-medium text-foreground outline-none",
        "placeholder:text-muted-foreground focus:ring-2 focus:ring-ring",
      )}
    />
  )
}

interface ToolbarButtonProps {
  title: string
  onClick?: () => void
  children: ReactNode
}

function ToolbarButton({ title, onClick, children }: ToolbarButtonProps) {
  const Cmp: "button" = "button"
  return (
    <Cmp
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Cmp>
  )
}