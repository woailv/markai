import { Events } from "@wailsio/runtime"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import {
  RichEditor,
  type RichEditorHandle,
  documentToPlainText,
} from "@/components/rich-editor"
import { cn } from "@/lib/utils"
import { useDraftStore } from "@/store"

import { ComposerToolbar } from "./composer-toolbar"
import type { Template } from "../types"

interface RichComposerProps {
  onSend: (plain: string) => void
  placeholder?: string
  templates: Template[]
  selectedTemplateIds: Set<number>
  onToggleTemplate: (id: number) => void
  onCreateTemplate: () => void
  onEditTemplate: (id: number) => void
  onDeleteTemplate: (id: number) => void
}

/**
 * 消息输入框:内核 + 业务壳。
 * 业务职责:草稿持久化、工具条、拖放视觉反馈、Wails files:dropped 事件处理、
 *          Enter 触发 onSend。所有 CodeMirror 细节由内核统一负责。
 */
export function RichComposer({
  onSend,
  placeholder = "输入你的消息 — 拖入文件或使用模板 (Enter 发送,Shift+Enter 换行)",
  templates,
  selectedTemplateIds,
  onToggleTemplate,
  onCreateTemplate,
  onEditTemplate,
  onDeleteTemplate,
}: RichComposerProps) {
  const setDraft = useDraftStore((s) => s.setDraft)
  const clearDraft = useDraftStore((s) => s.clearDraft)

  const [doc, setDoc] = useState<string>(() => {
    const draft = useDraftStore.getState().getDraft()
    return typeof draft === "string" ? draft : String(draft ?? "")
  })
  const [isDragOver, setIsDragOver] = useState(false)
  const editorRef = useRef<RichEditorHandle>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(doc)
  }, [doc, setDraft])

  const send = useCallback(() => {
    const res = documentToPlainText(doc)
    const plain = (typeof res === "string" ? res : String(res ?? "")).trim()
    if (!plain) return
    onSend(plain)
    setDoc("")
    clearDraft()
  }, [doc, onSend, clearDraft])

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      if (!isDragOver) setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setIsDragOver(false)
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    setIsDragOver(false)
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault()
    }
    // 不 stopPropagation,让 Wails 拦截器收到冒泡
  }

  useEffect(() => {
    const unsub = Events.On("files:dropped", (evt) => {
      const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
      if (!payload?.paths?.length) return

      const handle = editorRef.current
      if (!handle) return
      const view = handle.view
      if (!view) return
      const root = rootRef.current
      if (!root) return

      // 全局唯一目标选择:扫描页面上所有拖放目标(data-file-drop-target),
      // 依次尝试:落点命中 → 唯一目标;若无坐标则用当前聚焦的目标。
      // 只有当选中的目标 === 本输入框时才处理,否则让位给对应的 MessageEditor。
      const hasCoords =
        payload.hasCoords &&
        payload.x !== undefined &&
        payload.y !== undefined

      const allTargets = Array.from(
        document.querySelectorAll<HTMLElement>('[data-file-drop-target="true"]'),
      )

      let winner: HTMLElement | null = null

      if (hasCoords) {
        // 使用 elementsFromPoint 拿到落点所有层级,取第一个属于 drop target 的
        const stack = document.elementsFromPoint(payload.x, payload.y)
        for (const el of stack) {
          const t = allTargets.find((tgt) => tgt.contains(el))
          if (t) {
            winner = t
            break
          }
        }
      }

      if (!winner) {
        // 无坐标或落点未命中任一目标 → 用焦点判定
        const focused = document.activeElement
        if (focused instanceof HTMLElement) {
          winner = allTargets.find((t) => t.contains(focused)) ?? null
        }
      }

      if (!winner) {
        // 兜底:仅有输入框时(无 MessageEditor 打开),交给输入框
        if (allTargets.length === 1 && allTargets[0] === root) {
          winner = root
        }
      }

      if (winner !== root) return

      setIsDragOver(false)
      if (hasCoords) {
        handle.insertFilesAtCoords(payload.paths, payload.x, payload.y)
      } else {
        handle.insertFilesAtCursor(payload.paths)
      }
    })
    return () => {
      unsub()
    }
  }, [])

  const rawPlain = documentToPlainText(doc)
  const canSend =
    (typeof rawPlain === "string" ? rawPlain : String(rawPlain ?? ""))
      .trim().length > 0

  return (
    <div
      ref={rootRef}
      data-file-drop-target="true"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col rounded-xl border bg-background transition-colors",
        "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30",
        isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/40",
        "[&.file-drop-target-active]:border-primary [&.file-drop-target-active]:bg-primary/5 [&.file-drop-target-active]:ring-2 [&.file-drop-target-active]:ring-primary/40",
      )}
    >
      <div className="px-2 pt-1.5">
        <RichEditor
          value={doc}
          onChange={setDoc}
          mode="editable"
          placeholder={placeholder}
          fileTokens={{ enabled: true, allowDrop: true }}
          onSubmit={send}
          editorRef={editorRef}
          className="w-full"
        />
      </div>

      <div className="px-2 pb-1.5 pt-1">
        <ComposerToolbar
          templates={templates}
          selectedIds={selectedTemplateIds}
          onToggleTemplate={onToggleTemplate}
          onCreateTemplate={onCreateTemplate}
          onEditTemplate={onEditTemplate}
          onDeleteTemplate={onDeleteTemplate}
          isDragOver={isDragOver}
          canSend={canSend}
          onSend={send}
        />
      </div>
    </div>
  )
}