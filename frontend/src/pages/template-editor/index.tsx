import { useEffect, useState, type FormEvent } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { Button } from "@/components/ui/button"
import { ROUTE_PATHS } from "@/router/paths"

import { BlockList } from "./blocks/block-list"
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

  useEffect(() => {
    if (!isEdit) return
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
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editId, isEdit])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
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
  }

  const handleCancel = () => {
    navigate(ROUTE_PATHS.HOME)
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          {isEdit ? "编辑模板" : "新建模板"}
        </h1>
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          返回
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="请输入标题"
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">内容块</label>
          <BlockList blocks={blocks} onChange={setBlocks} />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/80 py-3 backdrop-blur">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "保存中..." : "保存"}
          </Button>
        </div>
      </form>
    </div>
  )
}