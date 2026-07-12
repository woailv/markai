import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view"
import { EditorState, Prec } from "@codemirror/state"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import { cn } from "@/lib/utils"

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

/**
 * 富文本消息输入框(Zed 风格):
 * - 文本编辑区 + 底部内嵌工具条,共享同一圆角容器
 * - 底部左侧承载模板选择器与摘要芯片,右侧发送
 * - 文件拖拽:在光标位置插入 file token,渲染为 chip
 * - Enter 发送 / Shift+Enter 换行 / IME 组合期间不触发发送
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
  const [doc, setDoc] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const cmRef = useRef<ReactCodeMirrorRef>(null)

  const send = useCallback(() => {
    const plain = documentToPlainText(doc).trim()
    if (!plain) return
    onSend(plain)
    setDoc("")
  }, [doc, onSend])

  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      placeholderExt(placeholder),
      fileChipPlugin,
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
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "copy"
      if (!isDragOver) setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setIsDragOver(false)
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    setIsDragOver(false)
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    e.preventDefault()
    e.stopPropagation()

    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const p = (f as unknown as { path?: string }).path ?? f.name
      if (p) paths.push(p)
    }
    if (paths.length > 0) {
      insertFilesAtCoords(paths, e.clientX, e.clientY)
    }
  }

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ paths: string[] }>).detail
      if (!detail?.paths?.length) return
      insertFilesAtCursor(detail.paths)
    }
    window.addEventListener("prompttool:files-dropped", handler as EventListener)
    return () =>
      window.removeEventListener(
        "prompttool:files-dropped",
        handler as EventListener,
      )
  }, [insertFilesAtCursor])

  const canSend = documentToPlainText(doc).trim().length > 0

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col rounded-xl border bg-background transition-colors",
        "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30",
        isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/40",
      )}
    >
      {/* 文本编辑区 */}
      <div className="px-2 pt-1.5">
        <CodeMirror
          ref={cmRef}
          value={doc}
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

      {/* 内嵌工具条 */}
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