import { AlertTriangle } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"

import { useTabStore } from "../model/tab.store"
import { useTemplateStore } from "@/entities/template"

import { FilePanel, TemplateBufferSource } from "@/features/file-buffer"
import { templateExtensions } from "../model/template-extensions"

interface TemplateTabViewProps {
  tabId: string
  templateId: number | null
}

/**
 * 模板编辑 tab 的薄壳:统一走 FilePanel 渲染。
 *
 * - 新建模板由外部弹框先落库(拿到 id 再打开 tab),此处只处理"已绑定 id"分支。
 * - 未绑定 id 的兜底态显示错误提示,不做任何编辑器渲染,避免出现两条 create/update 路径。
 * - 模板改名等 UI 由 sidebar 承担,tab 内不再有标题输入框和保存按钮,交互与 file tab 对齐。
 */
export function TemplateTabView({ tabId, templateId }: TemplateTabViewProps) {
  const loaded = useTemplateStore((s) => s.loaded)
  const loadTemplates = useTemplateStore((s) => s.load)
  const tpl = useTemplateStore((s) =>
    templateId !== null ? s.templates.find((t) => t.id === templateId) : undefined,
  )
  const updateTitle = useTabStore((s) => s.updateTitle)

  useEffect(() => {
    if (!loaded) void loadTemplates()
  }, [loaded, loadTemplates])

  // 模板 title 在别处被改后,同步到 tab 标题(sidebar 重命名场景)
  useEffect(() => {
    if (tpl) updateTitle(tabId, tpl.title || "未命名模板")
  }, [tabId, tpl, updateTitle])

  // 稳定的 source 引用:templateId 不变则不重建,避免 use-file-buffer 反复 load
  const source = useRef<TemplateBufferSource | null>(null)
  const activeId = useRef<number | null>(null)
  const bufferSource = useMemo(() => {
    if (templateId === null) return null
    if (activeId.current !== templateId || !source.current) {
      source.current = new TemplateBufferSource(templateId)
      activeId.current = templateId
    }
    return source.current
  }, [templateId])

  if (templateId === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <div className="text-sm font-medium text-foreground">
          模板未初始化
        </div>
        <div className="max-w-md opacity-80">
          请先通过侧边栏"新建模板"按钮创建后再打开。
        </div>
      </div>
    )
  }

  // 使用伪路径驱动 viewer:.md 走 markdown 语法 + 模板占位符高亮
  return (
    <FilePanel
      tabId={tabId}
      source={bufferSource ?? undefined}
      path="template.md"
      extraExtensions={templateExtensions}
    />
  )
}