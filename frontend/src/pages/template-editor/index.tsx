import { ArrowLeft, Save } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { Button } from "@/components/ui/button"
import { ROUTE_PATHS } from "@/router/paths"

import { BlockList } from "./blocks/block-list"
import { EditorSidebar } from "./blocks/editor-sidebar"
import { EditorStatusBar } from "./blocks/editor-statusbar"
import {
  createEmptyBlock,
  parseTemplateContent,
  serializeBlocks,
} from "./blocks/serializer"
import type { TemplateBlock } from "./blocks/types"

export default function TemplateEditorPage() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const editId = params.id ? Number(params.id) : null
  const isEdit = editId !== null && !Number.isNaN(editId)

  const [title, setTitle] = useState("")
  const [blocks, setBlocks] = useState<TemplateBlock[]>(() => [
    createEmptyBlock(),
  ])
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!isEdit) {
      initializedRef.current = true
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const list = (await PromptTemplateService.List()) ?? []
        const found = list.find((t) => t.id === editId)
        if (cancelled) return
        if (!found) {
          setError("模板不存在")
        } else {
          setTitle(found.title)
          setBlocks(parseTemplateContent(found.content))
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) {
          setLoading(false)
          // 下一 tick 再打开 dirty 追踪,避免加载后立即标记
          setTimeout(() => {
            initializedRef.current = true
          }, 0)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editId, isEdit])

  // 追踪脏状态
  useEffect(() => {
    if (initializedRef.current) setDirty(true)
  }, [title, blocks])

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault()
      const trimmedTitle = title.trim()
      const nonEmptyBlocks = blocks
        .map((b) => ({ ...b, content: b.content.trimEnd() }))
        .filter((b) => b.content.trim().length > 0)
      if (!trimmedTitle) {
        setError("标题不能为空")
        return
      }
      if (nonEmptyBlocks.length === 0) {
        setError("至少需要一个非空块")
        return
      }
      setSubmitting(true)
      setError(null)
      try {
        const payloadContent = serializeBlocks(nonEmptyBlocks)
        if (isEdit && editId !== null) {
          await PromptTemplateService.Update({
            id: editId,
            title: trimmedTitle,
            content: payloadContent,
          })
        } else {
          await PromptTemplateService.Create({
            title: trimmedTitle,
            content: payloadContent,
          })
        }
        navigate(ROUTE_PATHS.HOME)
      } catch (err) {
        setError(String(err))
      } finally {
        setSubmitting(false)
      }
    },
    [blocks, editId, isEdit, navigate, title],
  )

  const handleCancel = useCallback(() => {
    if (dirty && !confirm("有未保存的修改,确定离开?")) return
    navigate(ROUTE_PATHS.HOME)
  }, [dirty, navigate])

  // 快捷键:Ctrl+S 保存 / Ctrl+Enter 新增块 / Esc 返回
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void handleSubmit()
      } else if (mod && e.key === "Enter") {
        e.preventDefault()
        setBlocks((prev) => [...prev, createEmptyBlock()])
      } else if (e.key === "Escape") {
        // 让输入框先处理
        const tag = (e.target as HTMLElement)?.tagName
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault()
          handleCancel()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleSubmit, handleCancel])

  const headerTitle = useMemo(
    () => (isEdit ? "编辑模板" : "新建模板"),
    [isEdit],
  )

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        加载模板中...
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-muted/20">
      {/* 顶部工具栏 */}
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="shrink-0"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {headerTitle}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="未命名模板"
              className="min-w-0 flex-1 rounded-md border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none transition-colors hover:bg-muted/50 focus:border-input focus:bg-background focus:ring-2 focus:ring-ring"
            />
          </div>

          <span
            className={
              "hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] sm:flex " +
              (dirty
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
                : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300")
            }
          >
            <span
              className={
                "h-1.5 w-1.5 rounded-full " +
                (dirty ? "bg-amber-500" : "bg-emerald-500")
              }
            />
            {dirty ? "未保存" : "已保存"}
          </span>

          <Button
            type="button"
            size="sm"
            onClick={() => handleSubmit()}
            disabled={submitting}
            className="shrink-0"
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {submitting ? "保存中..." : "保存"}
          </Button>
        </div>
      </header>

      {/* 主体 */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <BlockList blocks={blocks} onChange={setBlocks} />
        </main>

        <EditorSidebar blocks={blocks} />
      </div>

      {/* 底部状态栏 */}
      <EditorStatusBar blocks={blocks} dirty={dirty} />
    </div>
  )
}