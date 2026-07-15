import { useCallback, useEffect, useMemo, useState } from "react"

import { ConversationService } from "@/../bindings/prompttool/internal/services"
import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  useRightPanelStore,
  useTabStore,
  useTemplateStore,
  useWorkspaceStore,
  WORKSPACE_LAYOUT,
} from "@/store"

import { confirmDestructive } from "./executor/confirm-dialog"
import { HistorySidebar } from "./history-sidebar"
import { StatusBar } from "./status-bar"
import { TabBar } from "./tabs/tab-bar"
import { TabContent } from "./tabs/tab-content"
import { TemplateSidebar } from "./template-sidebar"
import { WorkspacePanel } from "./workspace-tree"

/**
 * HomePage 现在只做四件事:
 *   1. 三栏容器
 *   2. 持有会话列表,供 HistorySidebar 使用
 *   3. 把 HistorySidebar / TemplateSidebar 的动作分派到 tabStore
 *   4. 用 rightPanelStore 决定右侧显示历史 / 模板 / 什么都不显示
 * 会话数据由每个 chat tab 的 useChatSession 自己持有;
 * 模板数据由 useTemplateStore 集中管理。
 */
export default function HomePage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])

  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openChatTab = useTabStore((s) => s.openChatTab)
  const openNewChatTab = useTabStore((s) => s.openNewChatTab)
  const openTemplateTab = useTabStore((s) => s.openTemplateTab)
  const openNewTemplateTab = useTabStore((s) => s.openNewTemplateTab)
  const updateTitle = useTabStore((s) => s.updateTitle)
  const onConversationDeleted = useTabStore((s) => s.onConversationDeleted)
  const onTemplateDeleted = useTabStore((s) => s.onTemplateDeleted)

  const templates = useTemplateStore((s) => s.templates)
  const loadTemplates = useTemplateStore((s) => s.load)
  const removeTemplate = useTemplateStore((s) => s.remove)
  const updateTemplate = useTemplateStore((s) => s.update)
  const clearAllTemplates = useTemplateStore((s) => s.clearAll)

  const rightPanel = useRightPanelStore((s) => s.panel)
  const showRightPanel = useRightPanelStore((s) => s.show)

  const [conversationsLoaded, setConversationsLoaded] = useState(false)

  const loadConversations = useCallback(async () => {
    const list = await ConversationService.List()
    setConversations(list || [])
    setConversationsLoaded(true)
  }, [])

  useEffect(() => {
    void loadConversations()
    void loadTemplates()
  }, [loadConversations, loadTemplates])

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

  // 模板列表变化时同步 template tab 标题
  useEffect(() => {
    tabs.forEach((t) => {
      if (t.kind !== "template" || t.templateId == null) return
      const tpl = templates.find((x) => x.id === t.templateId)
      if (tpl && tpl.title && tpl.title !== t.title) {
        updateTitle(t.id, tpl.title)
      }
    })
  }, [templates, tabs, updateTitle])

  const activeConvId = useMemo(() => {
    const active = tabs.find((t) => t.id === activeTabId)
    return active && active.kind === "chat" ? active.conversationId : null
  }, [tabs, activeTabId])

  const activeTemplateId = useMemo(() => {
    const active = tabs.find((t) => t.id === activeTabId)
    return active && active.kind === "template" ? active.templateId : null
  }, [tabs, activeTabId])

  // -------- 会话侧操作 --------
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

  // -------- 模板侧操作 --------
  const handleSelectTemplate = useCallback(
    (id: number) => {
      const tpl = templates.find((t) => t.id === id)
      openTemplateTab(id, tpl?.title || "未命名模板")
    },
    [templates, openTemplateTab],
  )

  const handleNewTemplate = useCallback(() => {
    openNewTemplateTab()
    // 新建模板通常发生在用户点了侧边栏的 "+"; 保持模板面板可见
    showRightPanel("template")
  }, [openNewTemplateTab, showRightPanel])

  const handleRenameTemplate = useCallback(
    async (id: number, newTitle: string) => {
      try {
        const tpl = templates.find((t) => t.id === id)
        if (!tpl) return
        await updateTemplate(id, newTitle, tpl.content)
      } catch (err) {
        console.error("Failed to rename template", err)
      }
    },
    [templates, updateTemplate],
  )

  const handleDeleteTemplate = useCallback(
    async (id: number, e: React.MouseEvent) => {
      e.stopPropagation()
      const ok = await confirmDestructive({
        title: "删除模板",
        description: "将删除该模板,确定继续?",
        destructiveLabel: "删除",
      })
      if (!ok) return
      await removeTemplate(id)
      onTemplateDeleted(id)
    },
    [onTemplateDeleted, removeTemplate],
  )

  const handleClearAllTemplates = useCallback(async () => {
    const ok = await confirmDestructive({
      title: "清空所有模板",
      description: "将删除所有模板,确定继续?",
      destructiveLabel: "清空",
    })
    if (!ok) return
    const ids = await clearAllTemplates()
    ids.forEach((id) => onTemplateDeleted(id))
  }, [clearAllTemplates, onTemplateDeleted])

  // -------- 供 ChatPanel 使用的模板回调:打开为主编辑区的 tab --------
  const handleComposerCreateTemplate = useCallback(() => {
    openNewTemplateTab()
  }, [openNewTemplateTab])

  const handleComposerEditTemplate = useCallback(
    (id: number) => {
      const tpl = templates.find((t) => t.id === id)
      openTemplateTab(id, tpl?.title || "未命名模板")
    },
    [openTemplateTab, templates],
  )

  const handleComposerDeleteTemplate = useCallback(
    async (id: number) => {
      await removeTemplate(id)
      onTemplateDeleted(id)
    },
    [onTemplateDeleted, removeTemplate],
  )

  return (
    <div className="flex h-svh flex-col overflow-hidden border-t border-border">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <MainSplit
          rightPanel={rightPanel}
          conversations={conversations}
          activeConvId={activeConvId}
          activeTemplateId={activeTemplateId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onClearAllConversations={handleClearAllConversations}
          onSelectTemplate={handleSelectTemplate}
          onNewTemplate={handleNewTemplate}
          onRenameTemplate={handleRenameTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onClearAllTemplates={handleClearAllTemplates}
          onConversationsChanged={loadConversations}
          onComposerCreateTemplate={handleComposerCreateTemplate}
          onComposerEditTemplate={handleComposerEditTemplate}
          onComposerDeleteTemplate={handleComposerDeleteTemplate}
        />
      </div>
      <StatusBar />
    </div>
  )
}

interface MainSplitProps {
  rightPanel: "history" | "template" | null
  conversations: ConversationSummary[]
  activeConvId: number | null
  activeTemplateId: number | null
  onSelectConversation: (id: number) => void
  onNewConversation: () => void
  onDeleteConversation: (id: number, e: React.MouseEvent) => void
  onRenameConversation: (id: number, newTitle: string) => void
  onClearAllConversations: () => void
  onSelectTemplate: (id: number) => void
  onNewTemplate: () => void
  onRenameTemplate: (id: number, newTitle: string) => void
  onDeleteTemplate: (id: number, e: React.MouseEvent) => void
  onClearAllTemplates: () => void
  onConversationsChanged: () => Promise<void> | void
  onComposerCreateTemplate: () => void
  onComposerEditTemplate: (id: number) => void
  onComposerDeleteTemplate: (id: number) => void
}

/**
 * MainSplit 负责三栏(工作区 / 内容区 / 右侧面板)之间的可拖拽分割。
 * 工作区宽度以像素存于 store,这里在挂载时按当前视口换算传给 react-resizable-panels,
 * onLayout 回写像素值,保证既能持久化又能与既有 store 兼容。
 * 折叠工作区时,不渲染对应 Panel 和 Handle。
 *
 * 右侧面板槽位:根据 rightPanel 二选一渲染 HistorySidebar / TemplateSidebar,
 * 与 Zed 一致 —— 同一物理位置,内容随按钮切换。
 */
function MainSplit(props: MainSplitProps) {
  const {
    rightPanel,
    conversations,
    activeConvId,
    activeTemplateId,
    onSelectConversation,
    onNewConversation,
    onDeleteConversation,
    onRenameConversation,
    onClearAllConversations,
    onSelectTemplate,
    onNewTemplate,
    onRenameTemplate,
    onDeleteTemplate,
    onClearAllTemplates,
    onConversationsChanged,
  } = props

  const collapsed = useWorkspaceStore((s) => s.collapsed)
  const width = useWorkspaceStore((s) => s.width)
  const setWidth = useWorkspaceStore((s) => s.setWidth)
  const togglePanel = useRightPanelStore((s) => s.toggle)

  const templates = useTemplateStore((s) => s.templates)

  // 初始工作区面板尺寸(像素)。仅在挂载时计算一次,避免拖动过程中被 store→px 循环回弹。
  const initialWorkspacePx = useMemo(() => {
    return Math.max(
      WORKSPACE_LAYOUT.MIN_WIDTH,
      Math.min(width ?? 300, WORKSPACE_LAYOUT.MAX_WIDTH),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mainContent = (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TabBar />
      <TabContent
        onConversationsChanged={onConversationsChanged}
        onOpenHistory={() => togglePanel("history")}
      />
    </div>
  )

  const rightSidebar =
    rightPanel === "history" ? (
      <HistorySidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={onSelectConversation}
        onNew={onNewConversation}
        onDelete={onDeleteConversation}
        onRename={onRenameConversation}
        onClearAll={onClearAllConversations}
      />
    ) : rightPanel === "template" ? (
      <TemplateSidebar
        templates={templates}
        activeId={activeTemplateId}
        onSelect={onSelectTemplate}
        onNew={onNewTemplate}
        onRename={onRenameTemplate}
        onDelete={onDeleteTemplate}
        onClearAll={onClearAllTemplates}
      />
    ) : null

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {collapsed ? (
        <>
          {mainContent}
          {rightSidebar}
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
            <ResizablePanel minSize="20%" className="flex min-w-0">
              {mainContent}
            </ResizablePanel>
          </ResizablePanelGroup>
          {rightSidebar}
        </>
      )}
    </div>
  )
}