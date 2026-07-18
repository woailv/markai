import { Events } from "@wailsio/runtime"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

/**
 * 拖拽状态清除的通用兜底监听器安装函数。
 *
 * 背景:HTML5 拖放的原生事件对以下几种"取消场景"并不友好:
 *   1. 按 ESC 取消系统级(OS)文件拖拽 —— 不会向落点派发 dragleave,
 *      也不会派发 dragend(拖拽源在浏览器之外)。
 *   2. 拖拽出窗口 —— dragleave 的 relatedTarget 为 null,若外层用
 *      currentTarget === target 判断则会漏掉。
 *   3. 在编辑器以外的地方 drop —— 落点节点不会收到任何 dragleave。
 *   4. 窗口失焦(alt-tab 切走) —— 拖拽视觉态也应回退。
 *
 * 这里在 window 层统一兜底,保证上述任一场景发生后都能可靠地 clear 状态。
 * 返回一个卸载函数,调用后所有监听器一并移除。
 */
function installDragCancelFallback(clear: () => void): () => void {
  const doClear = () => clear()

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") clear()
  }

  // window 级 dragleave:relatedTarget 为 null 表示光标离开了整个窗口
  const onWindowLeave = (e: DragEvent) => {
    if (e.relatedTarget === null) clear()
  }

  window.addEventListener("dragend", doClear, true)
  window.addEventListener("drop", doClear, true)
  window.addEventListener("dragleave", onWindowLeave, true)
  window.addEventListener("keydown", onKey, true)
  window.addEventListener("blur", doClear, true)

  return () => {
    window.removeEventListener("dragend", doClear, true)
    window.removeEventListener("drop", doClear, true)
    window.removeEventListener("dragleave", onWindowLeave, true)
    window.removeEventListener("keydown", onKey, true)
    window.removeEventListener("blur", doClear, true)
  }
}

import {
  RichEditor,
  type RichEditorHandle,
  documentToPlainText,
} from "@/components/rich-editor"
import { cn } from "@/lib/utils"
import { useComposeSettingsStore, useDraftStore } from "@/store"

import {
  buildFilesContext,
  extractFilePathsFromMessages,
} from "../file-context"
import { buildTemplatesContext } from "../template-context"
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
  // 拖拽 enter/leave 计数器:处理"从父节点进入子节点时 dragleave 也会触发"
  // 这个 HTML5 拖放的经典缺陷 —— 只有当计数归零时才真正认为拖出。
  const dragCounterRef = useRef(0)
  // 窗口级兜底监听器的卸载函数,只在计数 > 0 期间挂载。
  const fallbackDisposerRef = useRef<(() => void) | null>(null)

  const clearDragState = useCallback(() => {
    dragCounterRef.current = 0
    setIsDragOver(false)
    fallbackDisposerRef.current?.()
    fallbackDisposerRef.current = null
  }, [])

  useEffect(() => {
    setDraft(doc)
  }, [doc, setDraft])

  const send = useCallback(() => {
    const res = documentToPlainText(doc)
    const plain = (typeof res === "string" ? res : String(res ?? "")).trim()
    if (!plain) return
    onSend(plain)

    // 根据用户设置,发送后可选地将"解析后的完整内容"写入剪贴板。
    // 与 chat-panel 中点击用户消息复制按钮的输出保持一致:
    //   templatesContext + filesContext + "**User**:\n\n{body}"
    // 额外考虑:工具栏勾选但未在消息中内联插入 token 的模板也需包含,
    // 避免"选了模板但没内联"导致复制时漏掉模板内容。
    if (useComposeSettingsStore.getState().copyAfterSend) {
      const body = plain
      const tokenPaths = extractFilePathsFromMessages([body])
      const extraTemplateIds = Array.from(selectedTemplateIds)

      void (async () => {
        try {
          const filesContext = await buildFilesContext(tokenPaths)
          const templatesContext = buildTemplatesContext(
            [body],
            templates,
            extraTemplateIds,
          )
          const header = `**User**:\n\n${body}`
          const prefixes = [templatesContext, filesContext].filter(
            (s) => s.length > 0,
          )
          const finalText =
            prefixes.length > 0
              ? `${prefixes.join("\n\n")}\n\n${header}`
              : header
          await navigator.clipboard?.writeText(finalText)
        } catch {
          /* 忽略剪贴板/上下文构建失败,不影响主流程 */
        }
      })()
    }

    setDoc("")
    clearDraft()
  }, [doc, onSend, clearDraft, selectedTemplateIds, templates])

  /**
   * 模板勾选:仅同步 selectedTemplateIds 状态,不自动向文档插入 token。
   * 已选模板通过工具栏的 tag 展示,由 tag 上的删除按钮取消。
   */
  const handleToggleTemplate = useCallback(
    (id: number) => {
      onToggleTemplate(id)
    },
    [onToggleTemplate],
  )

  const handleDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return
    dragCounterRef.current += 1
    if (!isDragOver) setIsDragOver(true)
    // 首次进入时挂载窗口级兜底,应对 ESC / 拖出窗口 / 窗口失焦等取消场景
    if (!fallbackDisposerRef.current) {
      fallbackDisposerRef.current = installDragCancelFallback(clearDragState)
    }
  }

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      // 有些浏览器/场景 dragenter 早于 mount 触发或被吞,补位保证状态一致
      if (!isDragOver) setIsDragOver(true)
      if (!fallbackDisposerRef.current) {
        fallbackDisposerRef.current = installDragCancelFallback(clearDragState)
      }
    }
  }

  const handleDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return
    // 使用计数器:每次 dragenter +1、dragleave -1,归零才代表真的离开根节点。
    // 单靠 currentTarget === target 无法覆盖"拖出根节点边缘"的场景。
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      clearDragState()
    }
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    clearDragState()
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault()
    }
    // 不 stopPropagation,让 Wails 拦截器收到冒泡
  }

  // 组件卸载时确保兜底监听器被移除
  useEffect(() => {
    return () => {
      fallbackDisposerRef.current?.()
      fallbackDisposerRef.current = null
    }
  }, [])

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

      clearDragState()
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
    // Zed 风格:
    //   - 无外框、无圆角、无背景色块;仅顶部一条极淡分隔线(border-t border-border/40)
    //     用于把输入区从消息区"轻描淡写"地分隔开
    //   - 聚焦时不出现 ring/border 颜色变化,让位给内部光标
    //   - 只有拖放时,整块面板才用 primary 高亮(顶线加粗 + 极淡 tinted 背景),
    //     作为清晰的落点反馈
    <div
      ref={rootRef}
      data-file-drop-target="true"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col border-t border-border bg-transparent transition-colors",
        isDragOver && "border-t-primary bg-primary/5",
        "[&.file-drop-target-active]:border-t-primary [&.file-drop-target-active]:bg-primary/5",
      )}
    >
      <div className="px-5 pb-1 pt-2.5">
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
      <div className="px-5 pb-0.5 pt-1">
        <ComposerToolbar
          templates={templates}
          selectedIds={selectedTemplateIds}
          onToggleTemplate={handleToggleTemplate}
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