/**
 * 统一富文本编辑器内核。
 *
 * 该组件不感知具体业务(不知道"发送消息"、"模板块"、"AI 回复"这些概念),
 * 只负责编辑与渲染。所有业务差异通过外层组件组合能力开关来表达。
 *
 * 三个业务场景:
 *  - 消息输入框(RichComposer):   mode=editable + fileTokens.allowDrop + onSubmit
 *  - 消息气泡(MessageContent):    mode=readonly / readonly-inverted + markdown
 *  - 模板块(MarkdownBlock):        mode=editable + markdown + extraExtensions(变量高亮)
 */
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { useEffect, useImperativeHandle, useMemo, useRef } from "react"

import {
  buildMarkdownExtensions,
  buildPlaceholder,
  buildSubmitKeymap,
  editableBaseExtensions,
  editableTheme,
  fileDropHandlers,
  invertedTheme,
  readOnlyExtensions,
  readonlyBaseTheme,
} from "./extensions"
import { createFileChipPlugin, type FileChipVariant } from "./file-chip"
import { encodeFileToken } from "./file-path-utils"
import {
  createTemplateChipPlugin,
  type TemplateChipVariant,
} from "./template-chip"

export type RichEditorMode = "editable" | "readonly" | "readonly-inverted"

export interface FileTokenOptions {
  /** 是否识别 file token 并渲染为 chip */
  enabled: boolean
  /**
   * 是否响应文件拖放(仅 editable 有意义)。
   * 只负责阻止 CodeMirror 默认粘贴文件内容;真正的路径插入由外层通过 editorRef 触发。
   */
  allowDrop?: boolean
}

export interface TemplateTokenOptions {
  /** 是否识别 template token 并渲染为 chip */
  enabled: boolean
}

export interface RichEditorHandle {
  view: EditorView | null
  /** 在光标处插入若干文件路径的 token */
  insertFilesAtCursor: (paths: string[]) => void
  /** 在指定坐标处插入若干文件路径的 token */
  insertFilesAtCoords: (paths: string[], clientX: number, clientY: number) => void
  focus: () => void
}

export interface RichEditorProps {
  value: string
  onChange?: (value: string) => void
  mode?: RichEditorMode
  /** 是否启用 markdown 解析。默认:editable 关,只读态开 */
  markdown?: boolean
  /** 是否启用语法高亮。默认跟随 markdown;editable 场景通常不启用避免视觉噪声 */
  syntaxHighlight?: boolean
  /** 是否行内换行。默认 true */
  lineWrapping?: boolean
  placeholder?: string
  fileTokens?: FileTokenOptions
  templateTokens?: TemplateTokenOptions
  /** Enter 提交(仅 editable) */
  onSubmit?: () => void
  /** 逃生舱:允许外层追加扩展(如模板编辑器的变量/路径高亮) */
  extraExtensions?: Extension[]
  editorRef?: React.Ref<RichEditorHandle>
  className?: string
}

/** 根据 mode 选择 chip 视觉变体 */
function chipVariantForMode(mode: RichEditorMode): FileChipVariant {
  if (mode === "editable") return "editable"
  if (mode === "readonly-inverted") return "readonly-inverted"
  return "readonly"
}

/** 模板 chip 视觉变体与 file chip 保持同构 */
function templateChipVariantForMode(
  mode: RichEditorMode,
): TemplateChipVariant {
  if (mode === "editable") return "editable"
  if (mode === "readonly-inverted") return "readonly-inverted"
  return "readonly"
}

export function RichEditor({
  value,
  onChange,
  mode = "editable",
  markdown: enableMarkdown,
  syntaxHighlight,
  lineWrapping = true,
  placeholder,
  fileTokens,
  templateTokens,
  onSubmit,
  extraExtensions,
  editorRef,
  className,
}: RichEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // 使用 Compartment 支持扩展的热更新,避免整体重建实例
  const extCompartment = useRef(new Compartment())

  // 通过 ref 承载最新的 onChange / onSubmit,避免频繁重建扩展
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  const submitRef = useRef<(() => void) | null>(onSubmit ?? null)
  useEffect(() => {
    submitRef.current = onSubmit ?? null
  }, [onSubmit])

  // markdown / syntaxHighlight 的默认值策略
  const useMarkdown =
    enableMarkdown ?? (mode !== "editable" ? true : false)
  const useHighlight =
    syntaxHighlight ??
    (useMarkdown && mode === "readonly") // 反色态不高亮,避免刺目
  // editable 场景不做代码色高亮

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = []

    if (lineWrapping) exts.push(EditorView.lineWrapping)

    // 主题
    if (mode === "editable") {
      exts.push(editableTheme)
      // 撤销历史 + 默认按键 + 滚动边距(仅编辑态)
      exts.push(...editableBaseExtensions)
    } else {
      exts.push(readonlyBaseTheme)
      if (mode === "readonly-inverted") exts.push(invertedTheme)
    }

    // 只读
    if (mode !== "editable") {
      exts.push(...readOnlyExtensions)
    }

    // markdown
    if (useMarkdown) {
      exts.push(...buildMarkdownExtensions(useHighlight))
    }

    // placeholder
    if (placeholder && mode === "editable") {
      exts.push(buildPlaceholder(placeholder))
    }

    // file token chip
    if (fileTokens?.enabled) {
      exts.push(createFileChipPlugin(chipVariantForMode(mode)))
    }

    // template token chip
    if (templateTokens?.enabled) {
      exts.push(
        createTemplateChipPlugin(templateChipVariantForMode(mode)),
      )
    }

    // 拖放:仅可编辑 + 显式允许时启用
    if (mode === "editable" && fileTokens?.allowDrop) {
      exts.push(fileDropHandlers)
    }

    // 提交快捷键:仅可编辑且外层显式提供了 onSubmit 时才挂载,
    // 否则会吞掉 Enter,破坏模板块等仅需换行的编辑体验。
    if (mode === "editable" && onSubmit) {
      exts.push(buildSubmitKeymap(submitRef))
    }

    // 变更回调
    if (mode === "editable") {
      exts.push(
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            onChangeRef.current?.(v.state.doc.toString())
          }
        }),
      )
      exts.push(EditorState.allowMultipleSelections.of(true))
    }

    // 逃生舱
    if (extraExtensions && extraExtensions.length > 0) {
      exts.push(...extraExtensions)
    }

    return exts
  }, [
    mode,
    lineWrapping,
    useMarkdown,
    useHighlight,
    placeholder,
    fileTokens?.enabled,
    fileTokens?.allowDrop,
    templateTokens?.enabled,
    extraExtensions,
    onSubmit,
  ])

  // 初始化 / 销毁
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [extCompartment.current.of(extensions)],
      }),
      parent: host,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 只在挂载时初始化;后续 value / extensions 变化各自增量同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 扩展热更新
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: extCompartment.current.reconfigure(extensions),
    })
  }, [extensions])

  // 同步受控 value(避免与用户键入抖动:仅当外部值与文档不一致时才写回)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  // 对外句柄
  useImperativeHandle(
    editorRef,
    (): RichEditorHandle => ({
      get view() {
        return viewRef.current
      },
      insertFilesAtCursor(paths) {
        const view = viewRef.current
        if (!view || paths.length === 0) return
        const sel = view.state.selection.main
        const insert = paths.map(encodeFileToken).join(" ") + " "
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert },
          selection: { anchor: sel.from + insert.length },
          scrollIntoView: true,
        })
        view.focus()
      },
      insertFilesAtCoords(paths, clientX, clientY) {
        const view = viewRef.current
        if (!view || paths.length === 0) return
        const pos =
          view.posAtCoords({ x: clientX, y: clientY }) ??
          view.state.doc.length
        const insert = paths.map(encodeFileToken).join(" ") + " "
        view.dispatch({
          changes: { from: pos, to: pos, insert },
          selection: { anchor: pos + insert.length },
          scrollIntoView: true,
        })
        view.focus()
      },
      focus() {
        viewRef.current?.focus()
      },
    }),
    [],
  )

  return <div ref={hostRef} className={className} />
}