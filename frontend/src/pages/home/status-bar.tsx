import { Pin, PanelLeft, PanelRight } from "lucide-react"
import { useEffect } from "react"

import { cn } from "@/lib/utils"
import {
  useRightPanelStore,
  useTabStore,
  useWindowStore,
  useWorkspaceStore,
} from "@/store"

/**
 * 计算状态栏右侧显示的"当前标签页"简介。
 * - file:显示文件绝对路径
 * - template:显示标题
 * (chat 已从 tab 系统移除,不再涉及)
 */
function useActiveTabSummary(): string {
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tabs = useTabStore((s) => s.tabs)
  const active = tabs.find((t) => t.id === activeTabId)
  if (!active) return ""
  if (active.kind === "file") return active.path
  return active.title
}

/**
 * 页面底部状态/工具条。
 * - 左侧:切换工作区目录树显示
 * - 右侧:切换右侧 ChatPanel 显示/隐藏
 * 模板/历史管理已下沉到 ChatPanel 顶栏的 Popover,不再出现于此。
 */
export function StatusBar() {
  const workspaceCollapsed = useWorkspaceStore((s) => s.collapsed)
  const setWorkspaceCollapsed = useWorkspaceStore((s) => s.setCollapsed)
  const chatCollapsed = useRightPanelStore((s) => s.collapsed)
  const toggleChat = useRightPanelStore((s) => s.toggleCollapsed)
  const alwaysOnTop = useWindowStore((s) => s.alwaysOnTop)
  const windowLoading = useWindowStore((s) => s.loading)
  const bootstrapWindow = useWindowStore((s) => s.bootstrap)
  const toggleAlwaysOnTop = useWindowStore((s) => s.toggleAlwaysOnTop)
  const activeSummary = useActiveTabSummary()

  useEffect(() => {
    void bootstrapWindow()
  }, [bootstrapWindow])

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t bg-muted/30 px-2 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-1">
        <ToggleButton
          active={!workspaceCollapsed}
          onClick={() => setWorkspaceCollapsed(!workspaceCollapsed)}
          title={workspaceCollapsed ? "显示工作区目录" : "隐藏工作区目录"}
        >
          <PanelLeft className="h-3 w-3" />
          <span>工作区</span>
        </ToggleButton>
        {activeSummary && (
          <span
            className="ml-1 min-w-0 flex-1 truncate text-[10.5px] opacity-70"
            title={activeSummary}
          >
            {activeSummary}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <ToggleButton
          active={alwaysOnTop}
          onClick={() => void toggleAlwaysOnTop()}
          disabled={windowLoading}
          title={alwaysOnTop ? "取消窗口置顶" : "窗口置顶"}
        >
          <Pin
            className={cn(
              "h-3 w-3 transition-transform",
              alwaysOnTop
                ? "rotate-0 fill-current"
                : "-rotate-45",
            )}
          />
        </ToggleButton>
        <ToggleButton
          active={!chatCollapsed}
          onClick={toggleChat}
          title={chatCollapsed ? "显示会话面板" : "隐藏会话面板"}
        >
          <span>会话</span>
          <PanelRight className="h-3 w-3" />
        </ToggleButton>
      </div>
    </footer>
  )
}

interface ToggleButtonProps {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
  disabled,
}: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "flex h-5 items-center gap-1 rounded px-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "text-foreground hover:bg-muted"
          : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}