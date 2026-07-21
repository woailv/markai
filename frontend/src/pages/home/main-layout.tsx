import { useMemo } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  CHAT_PANEL_LAYOUT,
  EDITOR_LAYOUT,
  WORKSPACE_LAYOUT,
} from "@/shared/config"
import { useRightPanelStore } from "@/features/conversation"
import { TabBar, TabContent } from "@/features/tabs"
import { WorkspacePanel } from "@/features/workspace"
import { useWorkspaceStore } from "@/features/workspace"
import { useLayoutStore } from "@/shared/model"
import { RecentList } from "@/widgets/recent-list"

import { EmptyPlaceholder } from "./empty-placeholder"

interface MainLayoutProps {
  chatFullscreen: boolean
  chatPanel: React.ReactNode
  hasTabs: boolean
}

/**
 * 三栏布局:workspace | main tabs(editor) | chat panel。
 *
 * 分割窗口展开/收起时的三条不变式:
 *   1) 完全空态(工作区+会话区都收起且无 tab) → 展示占位页面,而不是空白。
 *   2) 侧栏"展开-收起-再展开"时,再展开的宽度 = 折叠前的宽度。
 *      为此,defaultSize 在每次面板即将挂载时(collapsed 由 true→false)重新
 *      读取 store 最新值,避免 useMemo(...,[]) 在 MainLayout 首挂时冻结旧值。
 *   3) 无 tab 时中间面板不存在,chat 自动填充剩余空间,但这段"自动扩张"的
 *      像素宽度不能写回 chatWidth;否则一旦打开文件,chat 会保留巨大的宽度,
 *      挤走编辑区。打开文件时中间面板以持久化的 editorWidth 出现,视觉上从
 *      chat 让出空间。
 *
 * 全屏 ChatPanel 时,直接跳过 ResizablePanelGroup,让聊天面板占满主区域。
 */
export function MainLayout({
  chatFullscreen,
  chatPanel,
  hasTabs,
}: MainLayoutProps) {
  const workspaceCollapsed = useWorkspaceStore((s) => s.collapsed)
  const setWorkspaceWidth = useWorkspaceStore((s) => s.setWidth)

  const chatCollapsed = useRightPanelStore((s) => s.collapsed)
  const setChatWidth = useRightPanelStore((s) => s.setWidth)

  const setEditorWidth = useLayoutStore((s) => s.setEditorWidth)

  // 每次面板由折叠切换到展开(或首次挂载)时,重新读取 store 的当前值作为
  // ResizablePanel 的 defaultSize。react-resizable-panels 仅在挂载时使用
  // defaultSize,后续 prop 变化不影响布局,因此这里"每次挂载读一次"即可。
  const workspaceInitialWidth = useMemo(() => {
    const w = useWorkspaceStore.getState().width
    return Math.max(WORKSPACE_LAYOUT.MIN_WIDTH, Math.min(w, WORKSPACE_LAYOUT.MAX_WIDTH))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceCollapsed])

  const chatInitialWidth = useMemo(() => {
    const w = useRightPanelStore.getState().width
    return Math.max(CHAT_PANEL_LAYOUT.MIN_WIDTH, Math.min(w, CHAT_PANEL_LAYOUT.MAX_WIDTH))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatCollapsed])

  const editorInitialWidth = useMemo(() => {
    const w = useLayoutStore.getState().editorWidth
    return Math.max(EDITOR_LAYOUT.MIN_WIDTH, w)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTabs])

  // 全屏模式:仅渲染 ChatPanel,占满整个主区域。
  if (chatFullscreen && !chatCollapsed) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">{chatPanel}</div>
    )
  }

  // 完全空态:工作区+会话区都收起,且没有打开任何文件。
  if (workspaceCollapsed && chatCollapsed && !hasTabs) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <EmptyPlaceholder />
      </div>
    )
  }

  // 中间(编辑)面板是否作为独立 ResizablePanel 存在。
  // - hasTabs:承载 TabBar/TabContent
  // - chatCollapsed 且 workspace 未收起:需要一个"填充块"顶住 workspace,
  //   让 workspace 保持自己的宽度而不是被 chat 挤走。
  // 其他情况不渲染:让 chat(或唯一存在的面板)自动填充。
  const showMiddle = hasTabs || (chatCollapsed && !workspaceCollapsed)

  const mainContent = hasTabs ? (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TabBar />
      <TabContent />
    </div>
  ) : (
    <div className="flex-1" />
  )

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex min-h-0 min-w-0 flex-1"
      >
        {!workspaceCollapsed && (
          <>
            <ResizablePanel
              id="workspace"
              defaultSize={workspaceInitialWidth}
              minSize={WORKSPACE_LAYOUT.MIN_WIDTH}
              maxSize={WORKSPACE_LAYOUT.MAX_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(panelSize) => {
                const px = Math.round(panelSize.inPixels)
                if (Number.isFinite(px) && px > 0) setWorkspaceWidth(px)
              }}
              className="flex min-w-0"
            >
              <WorkspacePanel
                renderRecent={(onPick) => <RecentList onPick={onPick} />}
              />
            </ResizablePanel>
            {(showMiddle || !chatCollapsed) && (
              <ResizableHandle
                withHandle
                className="w-px bg-border hover:bg-primary/30"
              />
            )}
          </>
        )}

        {showMiddle && (
          <ResizablePanel
            id="editor"
            defaultSize={hasTabs ? editorInitialWidth : EDITOR_LAYOUT.MIN_WIDTH}
            minSize={hasTabs ? EDITOR_LAYOUT.MIN_WIDTH : 48}
            groupResizeBehavior="preserve-pixel-size"
            onResize={(panelSize) => {
              // 只有真正承载编辑内容时才把宽度写回 store。
              // 无 tab 的填充态是"被动扩张",写回会覆盖用户上次真正调整过的值。
              if (!hasTabs) return
              const px = Math.round(panelSize.inPixels)
              if (Number.isFinite(px) && px > 0) setEditorWidth(px)
            }}
            className="flex min-w-0"
          >
            {mainContent}
          </ResizablePanel>
        )}

        {!chatCollapsed && (
          <>
            {(showMiddle || !workspaceCollapsed) && (
              <ResizableHandle
                withHandle
                className="w-px bg-border hover:bg-primary/30"
              />
            )}
            <ResizablePanel
              id="chat"
              defaultSize={chatInitialWidth}
              minSize={CHAT_PANEL_LAYOUT.MIN_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(panelSize) => {
                // 中间面板不存在时,chat 拉满剩余空间——这段被动扩张不写回,
                // 保留用户上次真正调整过的值,便于打开文件时中间以持久宽度出现。
                if (!showMiddle) return
                const px = Math.round(panelSize.inPixels)
                if (Number.isFinite(px) && px > 0) setChatWidth(px)
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
