import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { useEffect, useRef } from "react"

import { fileChipPlugin } from "./composer/file-token"

interface MessageContentProps {
  content: string
  /** 用户气泡为深色主色底,需要反转配色以保证可读性 */
  inverted?: boolean
}

/** 双方共用的基础主题:透明背景、继承字体、自动换行、无编辑痕迹 */
const baseTheme = EditorView.theme({
  "&": {
    fontSize: "14px",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    padding: "0",
    fontFamily: "inherit",
    lineHeight: "1.625",
    caretColor: "transparent",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.625",
    overflow: "visible",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    display: "none",
  },
  ".cm-selectionBackground": {
    backgroundColor: "hsl(var(--primary) / 0.15) !important",
  },
})

/** 深色主色底(用户气泡)上的反转配色:全部继承前景色,仅用字重/透明度区分 */
const invertedTheme = EditorView.theme({
  ".cm-content": {
    color: "inherit",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(255,255,255,0.25) !important",
  },
})

function buildExtensions(inverted: boolean) {
  const exts = [
    EditorView.lineWrapping,
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
    markdown({ base: markdownLanguage }),
    fileChipPlugin, // 注入文件芯片解析插件
    baseTheme,
  ]
  if (inverted) {
    exts.push(invertedTheme)
  } else {
    exts.push(syntaxHighlighting(defaultHighlightStyle, { fallback: true }))
  }
  return exts
}

/**
 * 只读的 CodeMirror Markdown 渲染器。
 * - 直接使用 EditorView(不经 @uiw/react-codemirror),避免长列表渲染的额外性能开销
 * - content 变化时通过增量 dispatch 更新文档,而非重建实例
 */
export function MessageContent({ content, inverted = false }: MessageContentProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartment = useRef(new Compartment())
  const invertedRef = useRef(inverted)

  // 初始化 / 销毁
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          themeCompartment.current.of(buildExtensions(invertedRef.current)),
        ],
      }),
      parent: host,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 同步 content
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === content) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
    })
  }, [content])

  // 同步 inverted(主题切换)
  useEffect(() => {
    const view = viewRef.current
    invertedRef.current = inverted
    if (!view) return
    view.dispatch({
      effects: themeCompartment.current.reconfigure(
        buildExtensions(inverted),
      ),
    })
  }, [inverted])

  return <div ref={hostRef} className="min-w-0 max-w-full" />
}
