import { useCallback, useEffect, useMemo, useState } from "react"

import { ConversationService } from "@/../bindings/prompttool/internal/services"
import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useTabStore, useWorkspaceStore, WORKSPACE_LAYOUT } from "@/store"

import { confirmDestructive } from "./executor/confirm-dialog"
import { HistorySidebar } from "./history-sidebar"
import { StatusBar } from "./status-bar"
import { TabBar } from "./tabs/tab-bar"
import { TabContent } from "./tabs/tab-content"
import { WorkspacePanel } from "./workspace-tree"

/**
 * HomePage 现在只做三件事:
 *   1. 三栏容器
 *   2. 持有会话列表,供 HistorySidebar 使用
 *   3. 把 HistorySidebar 的选择/删除动作分派到 tabStore
 * 会话数据由每个 chat tab 的 useChatSession 自己持有。
 */
export default function HomePage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openChatTab = useTabStore((s) => s.openChatTab)
  const openNewChatTab = useTabStore((s) => s.openNewChatTab)
  const updateTitle = useTabStore((s) => s.updateTitle)
  const onConversationDeleted = useTabStore((s) => s.onConversationDeleted)

  const [conversationsLoaded, setConversationsLoaded] = useState(false)

  const loadConversations = useCallback(async () => {
    const list = await ConversationService.List()
    setConversations(list || [])
    setConversationsLoaded(true)
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  // 启动流程:
  //   1. 会话列表加载完成后,清理指向已删除会话的持久化 tab
  //   2. 若清理后仍无 tab,才开一个空的新会话 tab
  // 注意:React 18 StrictMode 下 effect 会执行两次,必须从 store 读最新状态,
  // 不能依赖闭包里的 tabs,否则会创建两个"新会话"标签。
  useEffect(() => {
    if (!conversationsLoaded) return
    const validIds = new Set(conversations.map((c) => c.id))
    const currentTabs = useTabStore.getState().tabs
    currentTabs.forEach((t) => {
      if (
        t.kind === "chat" &&
        t.conversationId != null &&
        !validIds.has(t.conversationId)
      ) {
        onConversationDeleted(t.conversationId)
      }
    })
    if (useTabStore.getState().tabs.length === 0) {
      openNewChatTab()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsLoaded])

  // 每次会话列表变化,同步一次 chat tab 的标题
  useEffect(() => {
    tabs.forEach((t) => {
      if (t.kind !== "chat" || t.conversationId == null) return
      const conv = conversations.find((c) => c.id === t.conversationId)
      if (conv && conv.title && conv.title !== t.title) {
        updateTitle(t.id, conv.title)
      }
    })
  }, [conversations, tabs, updateTitle])

  const activeConvId = (() => {
    const active = tabs.find((t) => t.id === activeTabId)
    return active && active.kind === "chat" ? active.conversationId : null
  })()

  const handleSelectConversation = useCallback(
    (id: number) => {
      const conv = conversations.find((c) => c.id === id)
      openChatTab(id, conv?.title || "新会话")
    },
    [conversations, openChatTab],
  )

  const handleNewConversation = useCallback(() => {
    openNewChatTab()
  }, [openNewChatTab])

  const handleDeleteConversation = useCallback(
    async (id: number, e: React.MouseEvent) => {
      e.stopPropagation()
      const ok = await confirmDestructive({
        title: "删除会话",
        description: "将删除该会话及所有消息记录,确定继续?",
        destructiveLabel: "删除",
      })
      if (ok) {
        await ConversationService.Delete(id)
        onConversationDeleted(id)
        await loadConversations()
      }
    },
    [loadConversations, onConversationDeleted],
  )

  const handleRenameConversation = useCallback(
    async (id: number, newTitle: string) => {
      try {
        await ConversationService.Rename({
          conversationId: id,
          title: newTitle,
        })
        await loadConversations()
      } catch (err) {
        console.error("Failed to rename conversation", err)
      }
    },
    [loadConversations],
  )

  const handleClearAllConversations = useCallback(async () => {
    const ok = await confirmDestructive({
      title: "清空所有会话",
      description: "将删除所有历史会话及消息记录,确定继续?",
      destructiveLabel: "清空",
    })
    if (!ok) return
    for (const conv of conversations) {
      await ConversationService.Delete(conv.id)
      onConversationDeleted(conv.id)
    }
    await loadConversations()
  }, [conversations, loadConversations, onConversationDeleted])

  return (
    <div className="flex h-svh flex-col overflow-hidden border-t border-border">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <MainSplit
          sidebarOpen={sidebarOpen}
          conversations={conversations}
          activeConvId={activeConvId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onClearAllConversations={handleClearAllConversations}
          onConversationsChanged={loadConversations}
          onToggleHistory={() => setSidebarOpen((v) => !v)}
        />
      </div>
      <StatusBar
        historyOpen={sidebarOpen}
        onToggleHistory={() => setSidebarOpen((v) => !v)}
      />
    </div>
  )
}

/**
 * MainSplit 负责三栏(工作区 / 内容区 / 历史)之间的可拖拽分割。
 * 工作区宽度以像素存于 store,这里在挂载时按当前视口换算为百分比传给 react-resizable-panels,
 * onLayout 回写像素值,保证既能持久化又能与既有 store 兼容。
 * 折叠工作区时,不渲染对应 Panel 和 Handle。
 */
function MainSplit({
  sidebarOpen,
  conversations,
  activeConvId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onClearAllConversations,
  onConversationsChanged,
  onToggleHistory,
}: {
  sidebarOpen: boolean
  conversations: ConversationSummary[]
  activeConvId: number | null
  onSelectConversation: (id: number) => void
  onNewConversation: () => void
  onDeleteConversation: (id: number, e: React.MouseEvent) => void
  onRenameConversation: (id: number, newTitle: string) => void
  onClearAllConversations: () => void
  onConversationsChanged: () => Promise<void> | void
  onToggleHistory: () => void
}) {
  const collapsed = useWorkspaceStore((s) => s.collapsed)
  const width = useWorkspaceStore((s) => s.width)
  const setWidth = useWorkspaceStore((s) => s.setWidth)

  // 初始工作区面板尺寸(像素)。仅在挂载时计算一次,避免拖动过程中被 store→px 循环回弹。
  const initialWorkspacePx = useMemo(() => {
    return Math.max(
      WORKSPACE_LAYOUT.MIN_WIDTH,
      Math.min(width ?? 300, WORKSPACE_LAYOUT.MAX_WIDTH)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mainContent = (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TabBar />
      <TabContent
        onConversationsChanged={onConversationsChanged}
        onOpenHistory={onToggleHistory}
      />
    </div>
  )

  const historyPanel = sidebarOpen ? (
    <HistorySidebar
      conversations={conversations}
      activeId={activeConvId}
      onSelect={onSelectConversation}
      onNew={onNewConversation}
      onDelete={onDeleteConversation}
      onRename={onRenameConversation}
      onClearAll={onClearAllConversations}
    />
  ) : null

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {collapsed ? (
        <>
          {mainContent}
          {historyPanel}
        </>
      ) : (
        <>
          <ResizablePanelGroup
            orientation="horizontal"
            className="flex min-h-0 min-w-0 flex-1"
          >
            <ResizablePanel
              defaultSize={initialWorkspacePx}
              minSize={WORKSPACE_LAYOUT.MIN_WIDTH}
              maxSize={WORKSPACE_LAYOUT.MAX_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(panelSize) => {
                // v4 回调签名: { asPercentage, inPixels }
                const px = Math.round(panelSize.inPixels)
                if (!Number.isFinite(px) || px <= 0) return
                if (Math.abs(px - width) >= 1) setWidth(px)
              }}
              className="flex min-w-0"
            >
              <WorkspacePanel />
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="w-px bg-border hover:bg-primary/30"
            />
            <ResizablePanel
              minSize="20%"
              className="flex min-w-0"
            >
              {mainContent}
            </ResizablePanel>
          </ResizablePanelGroup>
          {historyPanel}
        </>
      )}
    </div>
  )
}