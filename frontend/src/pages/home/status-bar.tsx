import { PanelLeft, PanelRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { useTabStore, useWorkspaceStore } from "@/store"

interface StatusBarProps {
  historyOpen: boolean
  onToggleHistory: () => void
}

/**
 * 计算状态栏右侧显示的"当前标签页"简介。
 * - file:显示文件绝对路径
 * - chat:显示会话标题
 * - template:显示模板标题
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
 * - 右侧:切换历史会话侧边栏显示
 * 参考 Zed 布局:两侧面板收起后由该条统一控制,不再占用侧边纵向空间。
 */
export function StatusBar({ historyOpen, onToggleHistory }: StatusBarProps) {
  const workspaceCollapsed = useWorkspaceStore((s) => s.collapsed)
  const setWorkspaceCollapsed = useWorkspaceStore((s) => s.setCollapsed)
  const activeSummary = useActiveTabSummary()

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
          active={historyOpen}
          onClick={onToggleHistory}
          title={historyOpen ? "隐藏历史会话" : "显示历史会话"}
        >
          <span>历史</span>
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
}

function ToggleButton({ active, onClick, title, children }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-5 items-center gap-1 rounded px-1.5 transition-colors",
        active
          ? "text-foreground hover:bg-muted"
          : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}