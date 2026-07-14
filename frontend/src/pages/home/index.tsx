import { useCallback, useEffect, useState } from "react"

import { ConversationService } from "@/../bindings/prompttool/internal/services"
import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"
import { useTabStore } from "@/store"

import { confirmDestructive } from "./executor/confirm-dialog"
import { HistorySidebar } from "./history-sidebar"
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

  const loadConversations = useCallback(async () => {
    const list = await ConversationService.List()
    setConversations(list || [])
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  // 若还没有任何 tab,启动时开一个空的新会话 tab,保证界面不空。
  // 注意:React 18 StrictMode 下 effect 会执行两次,必须从 store 读最新状态,
  // 不能依赖闭包里的 tabs,否则会创建两个"新会话"标签。
  useEffect(() => {
    if (useTabStore.getState().tabs.length === 0) {
      openNewChatTab()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div className="flex h-svh overflow-hidden">
      <WorkspacePanel />
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar />
        <TabContent
          onConversationsChanged={loadConversations}
          onOpenHistory={() => setSidebarOpen((v) => !v)}
        />
      </div>
      {sidebarOpen && (
        <HistorySidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          onClearAll={handleClearAllConversations}
        />
      )}
    </div>
  )
}