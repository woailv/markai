import { FileText } from "lucide-react"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/store"

import { ConfirmDialogHost } from "../executor/confirm-dialog"
import { FilePanel } from "../file-panel"
import { CloseConfirmDialogHost } from "./close-confirm-dialog"
import { CreateTemplateDialogHost } from "./template-create-dialog"
import { TemplateTabView } from "./template-tab-view"
import { useTabShortcuts } from "./use-tab-shortcuts"

/**
 * TabContent 只承载"文档类"标签(file / template)。
 * 会话内容已迁移到右侧固定的 ChatPanel,不再作为 tab。
 */
export function TabContent() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)

  useTabShortcuts()

  if (tabs.length === 0) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden whitespace-nowrap text-sm text-muted-foreground">
          <FileText className="h-8 w-8 shrink-0 opacity-60" />
          <div>暂无打开的标签</div>
          <div className="text-xs opacity-70">
            从左侧工作区打开文件,或在右侧面板管理模板
          </div>
        </div>
        <ConfirmDialogHost />
        <CloseConfirmDialogHost />
        <CreateTemplateDialogHost />
      </>
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
            className={cn(
              "min-h-0 flex-1 flex-col",
              isActive ? "flex" : "hidden",
            )}
          >
            {tab.kind === "file" ? (
              <FilePanel
                tabId={tab.id}
                path={tab.path}
                invalid={tab.invalid}
              />
            ) : tab.kind === "template" ? (
              <TemplateTabView tabId={tab.id} templateId={tab.templateId} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                该类型的标签尚未支持
              </div>
            )}
          </div>
        )
      })}
      <ConfirmDialogHost />
      <CloseConfirmDialogHost />
      <CreateTemplateDialogHost />
    </div>
  )
}