import { useCallback, useEffect } from "react"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { useRightPanelStore, useTabStore, useTemplateStore } from "@/store"

import { ChatPanel } from "../chat-panel"
import { ConfirmDialogHost, confirmDestructive } from "../executor/confirm-dialog"
import { useChatSession } from "../use-chat-session"
import { createTemplateWithDialog } from "./create-template-flow"

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
  const bindConversation = useTabStore((s) => s.bindConversation)
  const updateTitle = useTabStore((s) => s.updateTitle)
  const openTemplateTab = useTabStore((s) => s.openTemplateTab)
  const showRightPanel = useRightPanelStore((s) => s.show)

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

  // 新建模板:与侧边栏 "+" 逻辑一致 —— 先弹出名称输入框,
  // 落库成功后 createTemplateWithDialog 内部会调用 openTemplateTab 打开对应标签页。
  // 同时把右侧面板切到"模板",让用户新建后能在侧栏看到该条目。
  const handleCreateTemplate = useCallback(() => {
    showRightPanel("template")
    void createTemplateWithDialog()
  }, [showRightPanel])

  // 打开模板到标签页:从 store 拿最新 title,避免闭包过时。
  const handleEditTemplate = useCallback(
    (id: number) => {
      const tpl = useTemplateStore.getState().getById(id)
      openTemplateTab(id, tpl?.title || "未命名模板")
    },
    [openTemplateTab],
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