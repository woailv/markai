import { MessagesSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTabStore } from "@/store"

import { FilePanel } from "../file-panel"
import { ChatTabView } from "./chat-tab-view"

interface TabContentProps {
  /** 底部子组件用来刷新历史侧边栏。 */
  onConversationsChanged: () => void
  /** 侧边栏开关按钮回调,透传给 ChatPanel。 */
  onOpenHistory: () => void
}

/**
 * TabContent 会同时挂载所有已打开的 tab 面板,仅通过 CSS 切换显隐,
 * 从而避免切换标签时组件 unmount → 重新加载数据带来的空态闪烁。
 * 各 tab 用 tab.id 作 key,状态天然隔离。
 */
export function TabContent({
  onConversationsChanged,
  onOpenHistory,
}: TabContentProps) {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openNewChatTab = useTabStore((s) => s.openNewChatTab)

  if (tabs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <MessagesSquare className="h-8 w-8 opacity-60" />
        <div>暂无打开的标签</div>
        <Button size="sm" variant="outline" onClick={() => openNewChatTab()}>
          新建会话
        </Button>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            role="tabpanel"
            aria-hidden={!isActive}
            // 用 hidden 类隐藏非激活 tab,组件保持挂载,数据不丢失。
            // 激活的 tab 用 flex 布局占满可用空间。
            className={cn(
              "min-h-0 flex-1 flex-col",
              isActive ? "flex" : "hidden",
            )}
          >
            {tab.kind === "chat" ? (
              <ChatTabView
                tabId={tab.id}
                conversationId={tab.conversationId}
                onConversationsChanged={onConversationsChanged}
                onOpenHistory={onOpenHistory}
              />
            ) : tab.kind === "file" ? (
              <FilePanel
                tabId={tab.id}
                path={tab.path}
                invalid={tab.invalid}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                该类型的标签尚未支持
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}