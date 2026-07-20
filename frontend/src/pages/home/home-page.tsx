import { useCallback, useEffect, useMemo, useState } from "react"

import {
  useChatSession,
  useConversationStore,
  useRightPanelStore,
  PanelHeader,
} from "@/features/conversation"
import { useTabStore, useOpenFileBridge, createTemplateWithDialog } from "@/features/tabs"
import { useTemplateStore } from "@/entities/template"
import { ChatPanel } from "@/widgets/chat-panel"
import { confirmDestructive } from "@/shared/ui"

import { MainLayout } from "./main-layout"
import { StatusBar } from "./status-bar"

/**
 * HomePage 采用三栏布局:工作区 | Tab 编辑区 | 右侧 ChatPanel。
 *
 * 负责编排:
 * - 加载会话/模板初始数据,校正持久化 activeConversationId
 * - 桥接 useChatSession 与 ChatPanel 的顶栏/操作
 * - 通过 useOpenFileBridge 让 shared 的 requestOpenFile 落到 tab store
 *
 * 具体布局与三栏 Resizable 组合位于 <MainLayout/>,本文件只做数据/事件装配。
 */
export function HomePage() {
  useOpenFileBridge()

  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const setActiveConversationId = useConversationStore((s) => s.setActiveConversationId)
  const loadConversations = useConversationStore((s) => s.load)
  const renameConversation = useConversationStore((s) => s.rename)
  const setPinnedConversation = useConversationStore((s) => s.setPinned)
  const removeConversation = useConversationStore((s) => s.remove)

  const templates = useTemplateStore((s) => s.templates)
  const loadTemplates = useTemplateStore((s) => s.load)
  const removeTemplate = useTemplateStore((s) => s.remove)

  const tabs = useTabStore((s) => s.tabs)
  const openTemplateTab = useTabStore((s) => s.openTemplateTab)
  const updateTitle = useTabStore((s) => s.updateTitle)
  const onTemplateDeleted = useTabStore((s) => s.onTemplateDeleted)

  const chatCollapsed = useRightPanelStore((s) => s.collapsed)
  const chatWidth = useRightPanelStore((s) => s.width)
  const setChatWidth = useRightPanelStore((s) => s.setWidth)

  // 聊天面板全屏状态(非持久化,刷新后还原)
  const [chatFullscreen, setChatFullscreen] = useState(false)
  const toggleChatFullscreen = useCallback(() => setChatFullscreen((v) => !v), [])

  useEffect(() => {
    void loadConversations()
    void loadTemplates()
  }, [loadConversations, loadTemplates])

  // 校正持久化的 activeConversationId:数据源加载完成后,若其不存在则清空
  useEffect(() => {
    if (!useConversationStore.getState().loaded) return
    if (activeConversationId == null) return
    const exists = conversations.some((c) => c.id === activeConversationId)
    if (!exists) setActiveConversationId(null)
  }, [conversations, activeConversationId, setActiveConversationId])

  // 会话/模板标题同步到 tab 标题(仅 template kind)
  useEffect(() => {
    tabs.forEach((t) => {
      if (t.kind !== "template" || t.templateId == null) return
      const tpl = templates.find((x) => x.id === t.templateId)
      if (tpl && tpl.title && tpl.title !== t.title) {
        updateTitle(t.id, tpl.title)
      }
    })
  }, [templates, tabs, updateTitle])

  const chatSession = useChatSession({
    conversationId: activeConversationId,
    onConversationCreated: (newId) => setActiveConversationId(newId),
    onConversationsChanged: () => void loadConversations(),
  })

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const handleSelectConversation = useCallback(
    (id: number) => setActiveConversationId(id),
    [setActiveConversationId],
  )

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null)
  }, [setActiveConversationId])

  const handleDeleteConversation = useCallback(
    async (id: number) => {
      // 二次确认已在 HistoryPopover 内部通过 AlertDialog 完成
      await removeConversation(id)
    },
    [removeConversation],
  )

  const handleClearAllConversations = useCallback(async () => {
    const targets = conversations.filter((c) => !c.pinned)
    if (targets.length === 0) return
    const ok = await confirmDestructive({
      title: "清空所有会话",
      description: `将删除 ${targets.length} 条未置顶会话及其消息记录(置顶会话保留),确定继续?`,
      destructiveLabel: "清空",
    })
    if (!ok) return
    for (const c of targets) {
      await removeConversation(c.id)
    }
  }, [conversations, removeConversation])

  const handleClearMessages = useCallback(async () => {
    await chatSession.clearMessages()
  }, [chatSession])

  const handleDeleteMessage = useCallback(
    async (msgId: number) => {
      const ok = await confirmDestructive({
        title: "删除消息",
        description: "将删除此消息,确定继续?",
        destructiveLabel: "删除",
      })
      if (ok) await chatSession.deleteMessage(msgId)
    },
    [chatSession],
  )

  const handleNewTemplate = useCallback(() => {
    void createTemplateWithDialog()
  }, [])

  const handleEditTemplate = useCallback(
    (id: number) => {
      const tpl = templates.find((t) => t.id === id)
      openTemplateTab(id, tpl?.title || "未命名模板")
    },
    [openTemplateTab, templates],
  )

  const chatHeader = (
    <PanelHeader
      title={activeConv?.title ?? "新会话"}
      conversations={conversations}
      activeConvId={activeConversationId}
      onNewConversation={handleNewConversation}
      onSelectConversation={handleSelectConversation}
      onDeleteConversation={handleDeleteConversation}
      onRenameConversation={renameConversation}
      onTogglePinConversation={setPinnedConversation}
      onClearAllConversations={handleClearAllConversations}
      fullscreen={chatFullscreen}
      onToggleFullscreen={toggleChatFullscreen}
    />
  )

  return (
    <div className="flex h-svh flex-col overflow-hidden border-t border-border">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <MainLayout
          chatCollapsed={chatCollapsed}
          chatWidth={chatWidth}
          setChatWidth={setChatWidth}
          chatFullscreen={chatFullscreen}
          chatPanel={
            <ChatPanel
              messages={chatSession.messages}
              onSend={chatSession.sendMessage}
              onClear={handleClearMessages}
              onDeleteMessage={handleDeleteMessage}
              onEditMessage={chatSession.editMessage}
              templates={chatSession.templates}
              selectedTemplateIds={chatSession.selectedTemplateIds}
              onToggleTemplate={chatSession.toggleTemplate}
              onCreateTemplate={handleNewTemplate}
              onEditTemplate={handleEditTemplate}
              onDeleteTemplate={async (id) => {
                await removeTemplate(id)
                onTemplateDeleted(id)
              }}
              conversationTitle={activeConv?.title ?? ""}
              header={chatHeader}
            />
          }
        />
      </div>
      <StatusBar />
    </div>
  )
}
