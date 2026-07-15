import { Save } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { RichEditor } from "@/components/rich-editor"
import { Button } from "@/components/ui/button"
import { useTabStore, useTemplateStore } from "@/store"

import { flattenLegacyContent } from "../utils"
import { templateExtensions } from "./template-extensions"
import { useCloseSaveHandler } from "./close-coordinator"

interface TemplateTabViewProps {
  tabId: string
  templateId: number | null
}

/**
 * 单文本 Markdown 模板编辑器。
 *
 * 设计要点:
 *  - 数据源统一走 useTemplateStore,避免 tab 内自己 fetch 造成的与 sidebar 不同步
 *  - 通过 baseline snapshot 计算 dirty,写回 tab store 供 close-coordinator 使用
 *  - 保存成功后:新建 → bindTemplate + 刷 store;编辑 → update store 内的模板
 *  - 快捷键 Ctrl+S 保存;标题空时不允许保存(否则后端可能拒绝)
 *
 * 不再有块结构、块拖拽、块折叠;模板内容就是一段完整的 Markdown。
 * 变量占位符 {{var}} 与路径引用高亮由 templateExtensions 保留。
 */
export function TemplateTabView({ tabId, templateId }: TemplateTabViewProps) {
  const templates = useTemplateStore((s) => s.templates)
  const loaded = useTemplateStore((s) => s.loaded)
  const loadTemplates = useTemplateStore((s) => s.load)
  const createTemplate = useTemplateStore((s) => s.create)
  const updateTemplate = useTemplateStore((s) => s.update)

  const bindTemplate = useTabStore((s) => s.bindTemplate)
  const setDirty = useTabStore((s) => s.setDirty)
  const updateTitle = useTabStore((s) => s.updateTitle)

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [baseline, setBaseline] = useState<string>(snapshot("", ""))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 加载态:未绑定模板从空开始,直接就绪;已绑定则等 store 加载完成
  const initializedRef = useRef(false)

  // 保证 store 至少加载过一次
  useEffect(() => {
    if (!loaded) void loadTemplates()
  }, [loaded, loadTemplates])

  // 从 store 拉取当前模板,初始化编辑状态。仅在真正拿到数据(或确认新建)时执行一次,
  // 之后 store 里模板变化(例如别的地方 rename)不再覆盖用户当前编辑。
  useEffect(() => {
    if (initializedRef.current) return
    if (templateId === null) {
      initializedRef.current = true
      setTitle("")
      setContent("")
      setBaseline(snapshot("", ""))
      return
    }
    if (!loaded) return
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) {
      // 找不到:可能已被删除,交给 onTemplateDeleted 处理;此处不覆盖状态
      initializedRef.current = true
      return
    }
    const plain = flattenLegacyContent(tpl.content)
    initializedRef.current = true
    setTitle(tpl.title)
    setContent(plain)
    setBaseline(snapshot(tpl.title, plain))
  }, [loaded, templateId, templates])

  // 计算 dirty 并回写到 tab store,让关闭确认/未保存红点等 UI 生效
  const currentSnapshot = useMemo(
    () => snapshot(title, content),
    [title, content],
  )
  const dirty = initializedRef.current && currentSnapshot !== baseline
  useEffect(() => {
    setDirty(tabId, dirty)
  }, [dirty, setDirty, tabId])

  const save = useCallback(async (): Promise<boolean> => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError("标题不能为空")
      return false
    }
    setSaving(true)
    setError(null)
    try {
      if (templateId === null) {
        const created = await createTemplate(trimmedTitle, content)
        if (!created) {
          setError("创建失败")
          return false
        }
        bindTemplate(tabId, created.id)
        updateTitle(tabId, created.title)
        setBaseline(snapshot(created.title, content))
        return true
      }
      const updated = await updateTemplate(templateId, trimmedTitle, content)
      if (!updated) {
        setError("保存失败")
        return false
      }
      updateTitle(tabId, updated.title)
      setBaseline(snapshot(updated.title, content))
      return true
    } catch (err) {
      setError(String(err))
      return false
    } finally {
      setSaving(false)
    }
  }, [
    bindTemplate,
    content,
    createTemplate,
    tabId,
    templateId,
    title,
    updateTemplate,
    updateTitle,
  ])

  // 关闭 tab 时若 dirty,由 close-coordinator 通过此 handler 触发保存
  useCloseSaveHandler(tabId, save)

  // Ctrl+S 保存(仅当该 tab 处于激活状态时;通过 focus 判定即可,避免全局劫持)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        const root = rootRef.current
        if (!root) return
        if (!root.contains(document.activeElement)) return
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save])

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <header className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="未命名模板"
          className="min-w-0 flex-1 rounded-md border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none transition-colors hover:bg-muted/50 focus:border-input focus:bg-background focus:ring-2 focus:ring-ring"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="shrink-0"
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "保存中..." : "保存"}
        </Button>
      </header>

      {error && (
        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <RichEditor
          value={content}
          onChange={setContent}
          mode="editable"
          markdown
          placeholder="请输入模板内容 (支持 Markdown 与 {{变量}} 占位符)..."
          extraExtensions={templateExtensions}
          className="min-h-full"
        />
      </div>
    </div>
  )
}

/** 仅关注可持久化字段(title + content),忽略无关状态。 */
function snapshot(title: string, content: string): string {
  return title + "\u0000" + content
}