import { useMemo } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { CHAT_PANEL_LAYOUT, WORKSPACE_LAYOUT } from "@/shared/config"
import { TabBar, TabContent } from "@/features/tabs"
import { WorkspacePanel } from "@/features/workspace"
import { useWorkspaceStore } from "@/features/workspace"
import { RecentList } from "@/widgets/recent-list"

interface MainLayoutProps {
  chatCollapsed: boolean
  chatWidth: number
  setChatWidth: (w: number) => void
  chatFullscreen: boolean
  chatPanel: React.ReactNode
}

/**
 * 三栏布局:workspace | main tabs | chat panel。
 *
 * 使用两个 ResizablePanelGroup 无法共存于同一层(react-resizable-panels 要求
 * 同 group 内相邻),因此采用单 group + 三 Panel + 两 Handle 的方案。
 * 折叠状态下对应 Panel 与 Handle 都不渲染。
 *
 * 全屏 ChatPanel 时,直接跳过 ResizablePanelGroup,让聊天面板占满主区域。
 */
export function MainLayout({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mainContent = (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TabBar />
      <TabContent />
    </div>
  )

  // 全屏模式:仅渲染 ChatPanel,占满整个主区域。
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
              <WorkspacePanel
                renderRecent={(onPick) => <RecentList onPick={onPick} />}
              />
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
