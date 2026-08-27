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
} from "@/shared/rich-editor"
import { cn } from "@/lib/utils"
import { FILE_DROP_ROLE } from "@/shared/config"
import {
  hasDroppableFiles,
  resolveFileDropTarget,
  onFileDragCancel,
  consumeFileDragCancelled,
  installGlobalFileDragCancel,
} from "@/shared/model"
import { useComposeSettingsStore } from "../model/compose-settings.store"
import { useDraftStore } from "../model/draft.store"

import {
  buildFilesContext,
  extractFilePathsFromMessages,
} from "@/lib/file-context"
import { buildTemplatesContext } from "@/lib/template-context"
import { ComposerToolbar } from "./composer-toolbar"
import type { Template } from "@/entities/template"

/**
 * 工作区拖出条目携带的自定义 MIME(与 features/workspace 保持一致)。
 * 输入框需要识别它才能在"应用内拖拽"时也呈现落点视觉反馈。
 */
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

  const clearDragState = useCallback(() => {
    dragCounterRef.current = 0
    setIsDragOver(false)
  }, [])

  // 全局拖拽取消兜底监听,只安装一次(幂等)。
  useEffect(() => {
    installGlobalFileDragCancel()
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
            extraTemplateIds
          )
          const header = `**User**:\n\n${body}`
          const prefixes = [templatesContext, filesContext].filter(
            (s) => s.length > 0
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
    [onToggleTemplate]
  )

  const handleDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDroppableFiles(e.dataTransfer)) return
    dragCounterRef.current += 1
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (hasDroppableFiles(e.dataTransfer)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      // 有些浏览器/场景 dragenter 早于 mount 触发或被吞,补位保证状态一致
      if (!isDragOver) setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDroppableFiles(e.dataTransfer)) return
    // 使用计数器:每次 dragenter +1、dragleave -1,归零才代表真的离开根节点。
    // 单靠 currentTarget === target 无法覆盖"拖出根节点边缘"的场景。
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      clearDragState()
    }
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    clearDragState()
    if (hasDroppableFiles(e.dataTransfer)) {
      // 阻止 RichEditor 内核对该 drop 的默认处理(它会读 text/plain 插入),
      // 让工作区侧的 dragend → files:dropped 事件成为唯一的路径插入通道,
      // 避免出现"原始路径 + markdown 引用"重复插入。
      e.preventDefault()
    }
    // 不 stopPropagation,让 Wails 拦截器收到冒泡(外部文件拖入通道)
  }

  // 组件卸载时确保视觉态清理回调被移除(全局监听由 installGlobalFileDragCancel
  // 幂等保证只装一次,不随组件卸载移除)
  useEffect(() => {
    const unregister = onFileDragCancel(clearDragState)
    return unregister
  }, [clearDragState])

  useEffect(() => {
    const unsub = Events.On("files:dropped", (evt) => {
      const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
      if (!payload?.paths?.length) return

      // ESC / 拖出窗口已取消本次拖拽:直接忽略,不再插入,这才是"取消"语义。
      if (consumeFileDragCancelled()) {
        clearDragState()
        return
      }

      const handle = editorRef.current
      if (!handle) return
      const view = handle.view
      if (!view) return
      const root = rootRef.current
      if (!root) return

      // 全局唯一目标选择:扫描页面上所有拖放目标(data-file-drop-target)。
      // 有坐标时统一走 resolveFileDropTarget(取嵌套最深命中);无坐标时用焦点判定。
      // 命中自身或命中消息区域(代理到输入框)才处理,否则让位给对应的 MessageEditor。
      const hasCoords =
        payload.hasCoords && payload.x !== undefined && payload.y !== undefined

      const allTargets = Array.from(
        document.querySelectorAll<HTMLElement>('[data-file-drop-target="true"]')
      )

      let winner: HTMLElement | null = null

      if (hasCoords) {
        // 有坐标(拖放场景):统一走最具体(嵌套最深)的目标判定 ——
        // 拾取消息编辑器 / 会话消息区域 / 本输入框中真正命中的一个。
        winner = resolveFileDropTarget(payload.x, payload.y)
      } else {
        // 无坐标(右键菜单等主动触发):
        //  1) 优先按焦点判定,但只承认焦点在"composer 角色"目标中的情况;
        //     若焦点位于工作区面板(它也是 file-drop-target,但只处理带坐标的事件),
        //     则不能让工作区赢下这一轮,否则右键"添加到输入框"会无人处理。
        //  2) 焦点不在任何 composer 中时,把所有 composer 角色的目标视为候选,
        //     若唯一则交给它作为兜底 —— 这正是右键菜单场景的通路。
        const composerTargets = allTargets.filter(
          (t) => t.getAttribute("data-file-drop-role") === "composer"
        )
        const focused = document.activeElement
        if (focused instanceof HTMLElement) {
          winner = composerTargets.find((t) => t.contains(focused)) ?? null
        }
        if (!winner && composerTargets.length === 1) {
          winner = composerTargets[0]
        }
      }

      const isSelf = winner === root
      // 命中会话消息区域:把它视为输入框的"代理落点",
      // 无论位置几何,都把文件追加到输入框光标处。
      const isMessageAreaProxy =
        winner?.getAttribute("data-file-drop-role") ===
        FILE_DROP_ROLE.messageArea
      if (!isSelf && !isMessageAreaProxy) return

      clearDragState()
      if (isMessageAreaProxy) {
        handle.insertFilesAtCursor(payload.paths)
      } else if (hasCoords) {
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
    (typeof rawPlain === "string" ? rawPlain : String(rawPlain ?? "")).trim()
      .length > 0

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
      data-file-drop-role="composer"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col border-t border-border bg-transparent transition-colors",
        isDragOver && "border-t-primary bg-primary/5",
        "[&.file-drop-target-active]:border-t-primary [&.file-drop-target-active]:bg-primary/5"
      )}
    >
      <div className="px-5 pt-2.5 pb-1">
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
      <div className="px-5 pt-1 pb-0.5">
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
