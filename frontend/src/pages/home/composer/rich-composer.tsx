import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view"
import { EditorState, Prec } from "@codemirror/state"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { Send } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  documentToPlainText,
  encodeFileToken,
  fileChipPlugin,
} from "./file-token"

interface RichComposerProps {
  onSend: (plain: string) => void
  placeholder?: string
}

/**
 * 富文本消息输入框。
 * - 基于 CodeMirror 实现,支持自动增高。
 * - 文件拖拽:在光标位置插入 file token,渲染为 chip(只显示 basename)。
 * - Enter 发送 / Shift+Enter 换行 / IME 组合期间不触发发送。
 */
export function RichComposer({
  onSend,
  placeholder = "输入消息... (Enter 发送,Shift+Enter 换行,可拖入文件)",
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

  // 使用 ref 承载最新 send,避免 keymap 依赖变化重建 extensions
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      placeholderExt(placeholder),
      fileChipPlugin,
      // 高优先级捕获 Enter,IME 组合期间不发送
      Prec.highest(
        keymap.of([
          {
            key: "Enter",
            run: (view) => {
              // @ts-expect-error: EditorView 提供的 composing 状态
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

  /** 在光标位置插入 file token(处理多路径) */
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

  /** 从光标坐标定位到 doc 位置后再插入 */
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
    // 仅当离开根容器时关闭
    if (e.currentTarget === e.target) setIsDragOver(false)
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    setIsDragOver(false)
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    e.preventDefault()
    e.stopPropagation()

    // 浏览器 File 对象一般拿不到绝对路径,尝试 (file as any).path (Wails/Electron 等宿主注入)
    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      // 优先使用宿主注入的 path 字段
      const p = (f as unknown as { path?: string }).path ?? f.name
      if (p) paths.push(p)
    }
    if (paths.length > 0) {
      insertFilesAtCoords(paths, e.clientX, e.clientY)
    }
  }

  // 监听 Wails 事件 "files:dropped" (在 App 层桥接后触发)
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
        "flex flex-col gap-2 rounded-lg border bg-background p-2 transition-colors",
        "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30",
        isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/40",
      )}
    >
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
      <div className="flex items-center justify-between gap-2">
        <span className="pl-1 text-[10px] text-muted-foreground">
          {isDragOver ? "松开以插入文件路径" : "支持拖入文件"}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={!canSend}
          onClick={send}
          className="h-7 gap-1 px-3"
        >
          <Send className="h-3 w-3" />
          发送
        </Button>
      </div>
    </div>
  )
}