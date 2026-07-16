import { FileCode2, PanelLeft, PanelRight } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  useRightPanelStore,
  useTabStore,
  useWorkspaceStore,
  type RightPanelKind,
} from "@/store"

/**
 * 计算状态栏右侧显示的"当前标签页"简介。
 * - file:显示文件绝对路径
 * - chat / template:显示标题
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
 * - 右侧:模板 / 历史 两个互斥按钮,共同控制主页右侧面板显示的内容
 *   参考 Zed:同一位置替换内容,同一时刻至多一个面板可见。
 */
export function StatusBar() {
  const workspaceCollapsed = useWorkspaceStore((s) => s.collapsed)
  const setWorkspaceCollapsed = useWorkspaceStore((s) => s.setCollapsed)
  const panel = useRightPanelStore((s) => s.panel)
  const togglePanel = useRightPanelStore((s) => s.toggle)
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
        <RightPanelButton
          kind="template"
          activePanel={panel}
          onToggle={togglePanel}
          label="模板"
          icon={<FileCode2 className="h-3 w-3" />}
        />
        <RightPanelButton
          kind="history"
          activePanel={panel}
          onToggle={togglePanel}
          label="会话"
          icon={<PanelRight className="h-3 w-3" />}
        />
      </div>
    </footer>
  )
}

interface RightPanelButtonProps {
  kind: RightPanelKind
  activePanel: RightPanelKind | null
  onToggle: (kind: RightPanelKind) => void
  label: string
  icon: React.ReactNode
}

function RightPanelButton({
  kind,
  activePanel,
  onToggle,
  label,
  icon,
}: RightPanelButtonProps) {
  const active = activePanel === kind
  return (
    <ToggleButton
      active={active}
      onClick={() => onToggle(kind)}
      title={active ? `隐藏${label}` : `显示${label}`}
    >
      <span>{label}</span>
      {icon}
    </ToggleButton>
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