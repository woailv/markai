import { ArrowLeft, Save } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useNavigate, useParams } from "react-router-dom"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { Button } from "@/components/ui/button"
import { ROUTE_PATHS, buildTemplateEditPath } from "@/router/paths"

import { BlockList } from "./blocks/block-list"
import {
  createEmptyBlock,
  parseTemplateContent,
  serializeBlocks,
} from "./blocks/serializer"
import type { TemplateBlock } from "./blocks/types"

/**
 * 生成用于脏检测的快照:仅关注可持久化字段(title + 各块 content),
 * 忽略块 id 变化(重排/复制不算改),使用 \u0000 作为分隔符避免误合并。
 */
function snapshot(title: string, blocks: TemplateBlock[]): string {
  return title + "\u0000" + blocks.map((b) => b.content).join("\u0000")
}

export default function TemplateEditorPage() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const paramId = params.id ? Number(params.id) : null
  const isEditRoute = paramId !== null && !Number.isNaN(paramId)

  // 当前编辑对象的 id(新建保存成功后会被填充,后续保存走 Update)
  const [currentId, setCurrentId] = useState<number | null>(
    isEditRoute ? paramId : null,
  )
  const isEdit = currentId !== null

  const [title, setTitle] = useState("")
  const [blocks, setBlocks] = useState<TemplateBlock[]>(() => [
    createEmptyBlock(),
  ])
  const [loading, setLoading] = useState(isEditRoute)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 基线快照:加载完成或保存成功后刷新;dirty 由当前快照与基线比较得出
  const [baseline, setBaseline] = useState<string>(() =>
    snapshot("", [createEmptyBlock()]),
  )

  useEffect(() => {
    if (!isEditRoute) {
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const list = (await PromptTemplateService.List()) ?? []
        const found = list.find((t) => t.id === paramId)
        if (cancelled) return
        if (!found) {
          setError("模板不存在")
        } else {
          const loadedBlocks = parseTemplateContent(found.content)
          setTitle(found.title)
          setBlocks(loadedBlocks)
          setBaseline(snapshot(found.title, loadedBlocks))
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [paramId, isEditRoute])

  const currentSnapshot = useMemo(
    () => snapshot(title, blocks),
    [title, blocks],
  )
  const dirty = currentSnapshot !== baseline
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

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
        if (isEdit && currentId !== null) {
          await PromptTemplateService.Update({
            id: currentId,
            title: trimmedTitle,
            content: payloadContent,
          })
        } else {
          const created = await PromptTemplateService.Create({
            title: trimmedTitle,
            content: payloadContent,
          })
          // 新建成功后切换到编辑态,避免下次保存再次 Create
          if (created && typeof created.id === "number") {
            setCurrentId(created.id)
            // 用 replace 更新 URL,保持刷新语义正确、不污染历史栈
            navigate(buildTemplateEditPath(created.id), { replace: true })
          }
        }
        // 刷新脏检测基线为已保存的内容
        setBaseline(snapshot(trimmedTitle, nonEmptyBlocks))
      } catch (err) {
        setError(String(err))
      } finally {
        setSubmitting(false)
      }
    },
    [blocks, currentId, isEdit, navigate, title],
  )

  const handleCancel = useCallback(() => {
    if (dirtyRef.current && !confirm("有未保存的修改,确定离开?")) return
    navigate(ROUTE_PATHS.HOME)
  }, [navigate])

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
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="未命名模板"
              className="min-w-0 flex-1 rounded-md border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none transition-colors hover:bg-muted/50 focus:border-input focus:bg-background focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => handleSubmit()}
            disabled={submitting || !dirty}
            className="shrink-0"
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {submitting ? "保存中..." : "保存"}
          </Button>
        </div>
      </header>

      {/* 主体 */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <BlockList blocks={blocks} onChange={setBlocks} />
        </main>
      </div>
    </div>
  )
}