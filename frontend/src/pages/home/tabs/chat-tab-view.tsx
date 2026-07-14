import { useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { buildTemplateEditPath, ROUTE_PATHS } from "@/router/paths"
import { useTabStore } from "@/store"

import { ChatPanel } from "../chat-panel"
import { ConfirmDialogHost, confirmDestructive } from "../executor/confirm-dialog"
import { useChatSession } from "../use-chat-session"

interface ChatTabViewProps {
  tabId: string
  conversationId: number | null
  onConversationsChanged: () => void
  onOpenHistory: () => void
}

/**
 * 单个 chat tab 的宿主。挂载后即绑定到一个 useChatSession 实例;
 * tab 关闭/切换时组件 unmount,自然清理状态。
 */
export function ChatTabView({
  tabId,
  conversationId,
  onConversationsChanged,
  onOpenHistory,
}: ChatTabViewProps) {
  const navigate = useNavigate()
  const bindConversation = useTabStore((s) => s.bindConversation)
  const updateTitle = useTabStore((s) => s.updateTitle)

  const {
    messages,
    templates,
    selectedTemplateIds,
    currentConvId,
    sendMessage,
    clearMessages,
    deleteMessage,
    editMessage,
    toggleTemplate,
    refreshTemplates,
  } = useChatSession({
    conversationId,
    onConversationCreated: (newId) => {
      bindConversation(tabId, newId)
    },
    onConversationsChanged,
  })

  // Tab 标题跟随会话标题(需要从会话摘要拿);这里通过 conversationsChanged
  // 回调让 HomePage 刷新数据,再由 useTabTitleSync 效果统一处理。
  // 简化起见,这里不主动设置标题,依赖 HomePage 层同步。

  const handleClear = useCallback(async () => {
    const ok = await confirmDestructive({
      title: "清空当前会话",
      description: "将删除该会话中的所有消息记录,确定继续?",
      destructiveLabel: "清空",
    })
    if (!ok) return
    await clearMessages()
  }, [clearMessages])

  const handleDeleteMessage = useCallback(
    async (msgId: number) => {
      const ok = await confirmDestructive({
        title: "删除消息",
        description: "将删除此消息,确定继续?",
        destructiveLabel: "删除",
      })
      if (ok) await deleteMessage(msgId)
    },
    [deleteMessage],
  )

  const handleCreateTemplate = useCallback(() => {
    navigate(ROUTE_PATHS.TEMPLATE_NEW)
  }, [navigate])

  const handleEditTemplate = useCallback(
    (id: number) => {
      navigate(buildTemplateEditPath(id))
    },
    [navigate],
  )

  const handleDeleteTemplate = useCallback(
    async (id: number) => {
      await PromptTemplateService.Delete(id)
      await refreshTemplates()
    },
    [refreshTemplates],
  )

  // 若 tab 有一个绑定 convId 但会话不存在(被外部删除),useChatSession 内部
  // 会把 currentConvId 置 null,这里同步 tab 状态,让 tab 变回"新会话"。
  useEffect(() => {
    if (conversationId != null && currentConvId == null) {
      updateTitle(tabId, "新会话")
    }
  }, [conversationId, currentConvId, tabId, updateTitle])

  return (
    <>
      <ChatPanel
        messages={messages}
        onSend={sendMessage}
        onClear={handleClear}
        onOpenHistory={onOpenHistory}
        onDeleteMessage={handleDeleteMessage}
        onEditMessage={editMessage}
        templates={templates}
        selectedTemplateIds={selectedTemplateIds}
        onToggleTemplate={toggleTemplate}
        onCreateTemplate={handleCreateTemplate}
        onEditTemplate={handleEditTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        conversationTitle=""
      />
      <ConfirmDialogHost />
    </>
  )
}