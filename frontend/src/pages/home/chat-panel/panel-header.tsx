import {
  ChevronRight,
  FileCode2,
  MessagesSquare,
  Plus,
} from "lucide-react"

import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"
import { cn } from "@/lib/utils"

import type { Template } from "../types"
import { HistoryPopover } from "./history-popover"
import { TemplateManagerPopover } from "./template-manager-popover"

interface PanelHeaderProps {
  title: string
  conversations: ConversationSummary[]
  activeConvId: number | null
  templates: Template[]
  activeTemplateId: number | null

  onNewConversation: () => void
  onSelectConversation: (id: number) => void
  onDeleteConversation: (id: number) => void
  onRenameConversation: (id: number, newTitle: string) => void
  onTogglePinConversation: (id: number, pinned: boolean) => void
  onClearAllConversations: () => void

  onNewTemplate: () => void
  onEditTemplate: (id: number) => void
  onRenameTemplate: (id: number, newTitle: string) => void
  onDeleteTemplate: (id: number) => void
  onClearAllTemplates: () => void

  onCollapse: () => void
}

/**
 * ChatPanel 顶栏。承载当前会话标题 + 历史/模板/新建/折叠工具按钮。
 * 参照主流 AI 编辑器(Zed / Cursor)右侧 AI 面板的顶部工具栏形态。
 */
export function PanelHeader({
  title,
  conversations,
  activeConvId,
  templates,
  activeTemplateId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onTogglePinConversation,
  onClearAllConversations,
  onNewTemplate,
  onEditTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  onClearAllTemplates,
  onCollapse,
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

        <TemplateManagerPopover
          templates={templates}
          activeTemplateId={activeTemplateId}
          onEdit={onEditTemplate}
          onNew={onNewTemplate}
          onRename={onRenameTemplate}
          onDelete={onDeleteTemplate}
          onClearAll={onClearAllTemplates}
        >
          <ToolbarButton title="模板管理">
            <FileCode2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </TemplateManagerPopover>

        <ToolbarButton title="新建会话" onClick={onNewConversation}>
          <Plus className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <ToolbarButton title="收起面板" onClick={onCollapse}>
          <ChevronRight className="h-3.5 w-3.5" />
        </ToolbarButton>
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