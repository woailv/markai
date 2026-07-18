import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  CHAT_PANEL_LAYOUT,
  useConversationStore,
  useRightPanelStore,
  useTabStore,
  useTemplateStore,
  useWorkspaceStore,
  WORKSPACE_LAYOUT,
} from "@/store"

import { ChatPanel } from "./chat-panel"
import { PanelHeader } from "./chat-panel/panel-header"
import { confirmDestructive } from "./executor/confirm-dialog"
import { StatusBar } from "./status-bar"
import { TabBar } from "./tabs/tab-bar"
import { TabContent } from "./tabs/tab-content"
import { createTemplateWithDialog } from "./tabs/create-template-flow"
import { useChatSession } from "./use-chat-session"
import { WorkspacePanel } from "./workspace-tree"

/**
 * HomePage 采用三栏布局:
 *   [ 工作区 ] | [ Tab 编辑区 (file / template) ] | [ 右侧固定 ChatPanel ]
 *
 * - 工作区宽度由 useWorkspaceStore.width 持久化
 * - ChatPanel 宽度由 useRightPanelStore.width 持久化
 * - 两个可拖拽 handle 独立控制,与主流 AI 编辑器(Zed / Cursor)一致
 * - 折叠工作区/ChatPanel 时对应面板不渲染
 *
 * 会话数据由全局 useChatSession 承载,activeConversationId 存于
 * conversationStore,ChatPanel 顶栏 Popover 切换会话即切换全局指针。
 */
export default function HomePage() {
  // ---------- 全局 stores ----------
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore(
    (s) => s.activeConversationId,
  )
  const setActiveConversationId = useConversationStore(
    (s) => s.setActiveConversationId,
  )
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
  const toggleChatFullscreen = useCallback(
    () => setChatFullscreen((v) => !v),
    [],
  )

  // ---------- 初始加载 ----------
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

  // ---------- 会话相关(顶栏 Popover 调用) ----------
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
      const ok = await confirmDestructive({
        title: "删除会话",
        description: "将删除该会话及所有消息记录,确定继续?",
        destructiveLabel: "删除",
      })
      if (!ok) return
      await removeConversation(id)
    },
    [removeConversation],
  )

  const handleClearAllConversations = useCallback(async () => {
    // 排除置顶会话:仅清空未置顶的历史记录
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

  // ---------- 模板相关 ----------
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

  // ---------- 顶栏 ----------
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

interface MainLayoutProps {
  chatCollapsed: boolean
  chatWidth: number
  setChatWidth: (w: number) => void
  chatFullscreen: boolean
  chatPanel: React.ReactNode
}

/**
 * 三栏布局:workspace | main tabs | chat panel
 * 使用两个 ResizablePanelGroup 无法共存于同一层(react-resizable-panels 需要
 * 同 group 内相邻),因此采用单 group + 三 Panel + 两 Handle 的方案。
 * 折叠状态下对应 Panel 与 Handle 都不渲染。
 */
function MainLayout({
  chatCollapsed,
  chatWidth,
  setChatWidth,
  chatFullscreen,
  chatPanel,
}: MainLayoutProps) {
  const workspaceCollapsed = useWorkspaceStore((s) => s.collapsed)
  const workspaceWidth = useWorkspaceStore((s) => s.width)
  const setWorkspaceWidth = useWorkspaceStore((s) => s.setWidth)

  const initialWorkspacePx = useMemo(() => {
    return Math.max(
      WORKSPACE_LAYOUT.MIN_WIDTH,
      Math.min(workspaceWidth ?? 300, WORKSPACE_LAYOUT.MAX_WIDTH),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initialChatPx = useMemo(() => {
    return Math.max(CHAT_PANEL_LAYOUT.MIN_WIDTH, chatWidth)
  }, [])

  const mainContent = (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TabBar />
      <TabContent />
    </div>
  )

  // 全屏模式:所有 hooks 之后再判断,避免 hooks 数量变化。
  // 仅渲染 ChatPanel,占满整个主区域。
  if (chatFullscreen && !chatCollapsed) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">{chatPanel}</div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex min-h-0 min-w-0 flex-1"
      >
        {!workspaceCollapsed && (
          <>
            <ResizablePanel
              defaultSize={initialWorkspacePx}
              minSize={WORKSPACE_LAYOUT.MIN_WIDTH}
              maxSize={WORKSPACE_LAYOUT.MAX_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(panelSize) => {
                const px = Math.round(panelSize.inPixels)
                if (!Number.isFinite(px) || px <= 0) return
                if (Math.abs(px - workspaceWidth) >= 1) setWorkspaceWidth(px)
              }}
              className="flex min-w-0"
            >
              <WorkspacePanel />
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="w-px bg-border hover:bg-primary/30"
            />
          </>
        )}

        <ResizablePanel minSize={48} className="flex min-w-0">
          {mainContent}
        </ResizablePanel>

        {!chatCollapsed && (
          <>
            <ResizableHandle
              withHandle
              className="w-px bg-border hover:bg-primary/30"
            />
            <ResizablePanel
              defaultSize={initialChatPx}
              minSize={CHAT_PANEL_LAYOUT.MIN_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(panelSize) => {
                const px = Math.round(panelSize.inPixels)
                if (!Number.isFinite(px) || px <= 0) return
                if (Math.abs(px - chatWidth) >= 1) setChatWidth(px)
              }}
              className="flex min-w-0"
            >
              {chatPanel}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  )
}