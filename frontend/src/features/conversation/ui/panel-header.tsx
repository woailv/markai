import { Maximize2, MessagesSquare, Minimize2, Plus } from "lucide-react"

import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"
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

  fullscreen?: boolean
  onToggleFullscreen?: () => void
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
  fullscreen = false,
  onToggleFullscreen,
}: PanelHeaderProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-muted/30 px-2">
      <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span
        className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground"
        title={title}
      >
        {title || "新会话"}
      </span>

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

        {onToggleFullscreen && (
          <ToolbarButton
            title={fullscreen ? "退出全屏" : "全屏"}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </ToolbarButton>
        )}
      </div>
    </div>
  )
}

interface ToolbarButtonProps {
  title: string
  onClick?: () => void
  children: React.ReactNode
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