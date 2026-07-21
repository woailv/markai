import { PanelLeft, PanelRight } from "lucide-react"

import { useRightPanelStore } from "@/features/conversation"
import { useWorkspaceStore } from "@/features/workspace"

/**
 * 空态占位页面:
 * 当工作区和会话区都收起且没有打开任何文件时,
 * 中间不再是一片空白,而是一个引导用户展开侧边栏的提示。
 */
export function EmptyPlaceholder() {
  const setWorkspaceCollapsed = useWorkspaceStore((s) => s.setCollapsed)
  const setChatCollapsed = useRightPanelStore((s) => s.setCollapsed)

  return (
    <div className="flex flex-1 items-center justify-center overflow-hidden bg-background/50">
      <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
        <div className="text-sm text-muted-foreground">
          没有打开的文件
        </div>
        <div className="text-xs leading-relaxed text-muted-foreground/80">
          可以从左侧工作区选择文件,或打开右侧会话面板开始对话。
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setWorkspaceCollapsed(false)}
            className="flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            打开工作区
          </button>
          <button
            type="button"
            onClick={() => setChatCollapsed(false)}
            className="flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            打开会话
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
