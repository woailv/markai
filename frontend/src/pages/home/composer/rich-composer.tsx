import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view"
import { EditorState, Prec } from "@codemirror/state"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { Events } from "@wailsio/runtime"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import { cn } from "@/lib/utils"
import { useDraftStore } from "@/store"

import { ComposerToolbar } from "./composer-toolbar"
import {
  documentToPlainText,
  encodeFileToken,
  fileChipPlugin,
} from "./file-token"
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
  // 初始值取自持久化的草稿(全局单份);刷新/重启后可恢复
  const setDraft = useDraftStore((s) => s.setDraft)
  const clearDraft = useDraftStore((s) => s.clearDraft)

  const [doc, setDoc] = useState<string>(() => {
    const draft = useDraftStore.getState().getDraft()
    return typeof draft === "string" ? draft : String(draft ?? "")
  })
  const [isDragOver, setIsDragOver] = useState(false)
  const cmRef = useRef<ReactCodeMirrorRef>(null)

  // 内容变化时,写入草稿存储(持久化到 localStorage)
  useEffect(() => {
    setDraft(doc)
  }, [doc, setDraft])

  const send = useCallback(() => {
    const res = documentToPlainText(doc);
    const plain = (typeof res === "string" ? res : String(res ?? "")).trim();
    if (!plain) return
    onSend(plain)
    setDoc("")
    clearDraft()
  }, [doc, onSend, clearDraft])

  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      placeholderExt(placeholder),
      fileChipPlugin,
      EditorView.domEventHandlers({
        dragover(event) {
          if (event.dataTransfer?.types?.includes("Files")) {
            event.preventDefault() // 阻止浏览器默认行为以允许放置
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
            return true // 告诉 CodeMirror 我们处理了，防止它进一步干预
          }
          return false
        },
        drop(event) {
          if (event.dataTransfer?.types?.includes("Files")) {
            event.preventDefault() // 核心：阻止 CodeMirror 自动读取并粘贴文件内容
            // 严禁调用 event.stopPropagation()，必须让事件冒泡到外层容器
            return true // 告诉 CodeMirror 已处理
          }
          return false
        },
      }),
      Prec.highest(
        keymap.of([
          {
            key: "Enter",
            run: (view) => {
              if (view.composing) return false
              sendRef.current()
              return true
            },
          },
          {
            key: "Shift-Enter",
            run: (view) => {
              view.dispatch(view.state.replaceSelection("\n"))
              return true
            },
          },
        ]),
      ),
      EditorView.theme({
        "&": {
          fontSize: "14px",
          backgroundColor: "transparent",
        },
        ".cm-content": {
          padding: "6px 4px",
          fontFamily: "inherit",
          minHeight: "24px",
          caretColor: "hsl(var(--foreground))",
        },
        ".cm-scroller": {
          overflow: "auto",
          maxHeight: "200px",
          fontFamily: "inherit",
        },
        ".cm-line": {
          padding: "0",
        },
        "&.cm-focused": {
          outline: "none",
        },
        ".cm-placeholder": {
          color: "hsl(var(--muted-foreground))",
        },
      }),
      EditorState.allowMultipleSelections.of(true),
    ],
    [placeholder],
  )

  const insertFilesAtCursor = useCallback((paths: string[]) => {
    const view = cmRef.current?.view
    if (!view || paths.length === 0) return
    const sel = view.state.selection.main
    const insert = paths.map(encodeFileToken).join(" ") + " "
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor: sel.from + insert.length },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const insertFilesAtCoords = useCallback(
    (paths: string[], clientX: number, clientY: number) => {
      const view = cmRef.current?.view
      if (!view || paths.length === 0) return
      const pos = view.posAtCoords({ x: clientX, y: clientY }) ?? view.state.doc.length
      const insert = paths.map(encodeFileToken).join(" ") + " "
      view.dispatch({
        changes: { from: pos, to: pos, insert },
        selection: { anchor: pos + insert.length },
        scrollIntoView: true,
      })
      view.focus()
    },
    [],
  )

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault() // 必须 preventDefault 才能成为有效的 drop 目标
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
      e.preventDefault() // 阻止浏览器默认打开文件
    }
    // 依然不调用 stopPropagation()，保证 Wails 拦截器收到冒泡
  }

  useEffect(() => {
    const unsub = Events.On("files:dropped", (evt) => {
      setIsDragOver(false)
      // 兼容 Wails 3 中 payload 可能被包在数组首位的情况
      const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
      if (!payload?.paths?.length) return
      
      if (payload.hasCoords && payload.x !== undefined && payload.y !== undefined) {
        insertFilesAtCoords(payload.paths, payload.x, payload.y)
      } else {
        insertFilesAtCursor(payload.paths)
      }
    })
    return () => {
      unsub()
    }
  }, [insertFilesAtCoords, insertFilesAtCursor])

  const rawPlain = documentToPlainText(doc);
  const canSend = (typeof rawPlain === "string" ? rawPlain : String(rawPlain ?? "")).trim().length > 0

  return (
    <div
      data-file-drop-target="true"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col rounded-xl border bg-background transition-colors",
        "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30",
        isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/40",
        // Wails 会在原生拖放经过带有 data-file-drop-target 的元素时附加此 class
        "[&.file-drop-target-active]:border-primary [&.file-drop-target-active]:bg-primary/5 [&.file-drop-target-active]:ring-2 [&.file-drop-target-active]:ring-primary/40",
      )}
    >
      <div className="px-2 pt-1.5">
        <CodeMirror
          ref={cmRef}
          value={typeof doc === "string" ? doc : String(doc ?? "")}
          onChange={setDoc}
          extensions={extensions}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            dropCursor: true,
            indentOnInput: false,
            bracketMatching: false,
            autocompletion: false,
            searchKeymap: false,
            defaultKeymap: true,
          }}
          theme="none"
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