/**
 * 内核使用的 CodeMirror 扩展工厂 —— 主题、markdown、快捷键。
 * 三个业务场景通过内核的能力开关切换这些扩展,不再各自维护。
 */
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language"
import { EditorState, Prec, type Extension } from "@codemirror/state"
import type { EditorView as EditorViewType } from "@codemirror/view"
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view"

/**
 * 智能换行:根据当前行的前导缩进与列表标记,决定下一行的起始内容。
 * 匹配的标识:
 *   - 无序列表: -, *, +
 *   - 有序列表: 数字.  或 数字)
 *   - 任务列表: - [ ] / - [x]
 *   - 引用块:   >
 * 规则:
 *   1. 当前行 = 前导空白 + 标识 + 非空内容 → 下一行 = 前导空白 + 标识(任务列表重置为未勾选)
 *   2. 当前行 = 前导空白 + 标识 + 空内容    → 清空该标识(退出列表),仅保留 "\n"
 *   3. 无标识,仅有前导空白 → 下一行 = 相同的前导空白
 *   4. 光标不在行尾也照常应用(与主流编辑器一致)
 * 返回是否已处理。
 */
function performSmartNewline(view: EditorViewType): boolean {
  const state = view.state
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.from)
  const beforeCursor = state.doc.sliceString(line.from, sel.from)

  // 任务列表: - [ ] xxx / * [x] xxx (含缩进)
  const taskRe = /^(\s*)([-*+])(\s+)\[([ xX])\](\s+)(.*)$/
  // 普通无序列表
  const bulletRe = /^(\s*)([-*+])(\s+)(.*)$/
  // 有序列表: 1. xxx / 2) xxx
  const orderedRe = /^(\s*)(\d+)([.)])(\s+)(.*)$/
  // 引用块
  const quoteRe = /^(\s*)(>+)(\s+)(.*)$/
  // 纯缩进
  const indentRe = /^(\s+)$/

  let insert: string | null = null
  let clearFrom = -1

  const taskMatch = beforeCursor.match(taskRe)
  const bulletMatch = !taskMatch ? beforeCursor.match(bulletRe) : null
  const orderedMatch =
    !taskMatch && !bulletMatch ? beforeCursor.match(orderedRe) : null
  const quoteMatch =
    !taskMatch && !bulletMatch && !orderedMatch
      ? beforeCursor.match(quoteRe)
      : null

  if (taskMatch) {
    const [, indent, marker, sp1, , sp2, content] = taskMatch
    if (content.length === 0) {
      // 空任务项 → 清除标记,退出列表
      clearFrom = line.from
      insert = "\n"
    } else {
      insert = `\n${indent}${marker}${sp1}[ ]${sp2}`
    }
  } else if (bulletMatch) {
    const [, indent, marker, sp, content] = bulletMatch
    if (content.length === 0) {
      clearFrom = line.from
      insert = "\n"
    } else {
      insert = `\n${indent}${marker}${sp}`
    }
  } else if (orderedMatch) {
    const [, indent, num, delim, sp, content] = orderedMatch
    if (content.length === 0) {
      clearFrom = line.from
      insert = "\n"
    } else {
      const next = String(parseInt(num, 10) + 1)
      insert = `\n${indent}${next}${delim}${sp}`
    }
  } else if (quoteMatch) {
    const [, indent, marker, sp, content] = quoteMatch
    if (content.length === 0) {
      clearFrom = line.from
      insert = "\n"
    } else {
      insert = `\n${indent}${marker}${sp}`
    }
  } else {
    const indentMatch = beforeCursor.match(indentRe)
    if (indentMatch) {
      insert = `\n${indentMatch[1]}`
    } else {
      // 光标前包含非空白内容,但没有列表标记 → 沿用前导空白
      const leading = beforeCursor.match(/^(\s*)/)
      const indent = leading ? leading[1] : ""
      insert = `\n${indent}`
    }
  }

  if (insert === null) return false

  if (clearFrom >= 0) {
    view.dispatch({
      changes: { from: clearFrom, to: sel.to, insert },
      selection: { anchor: clearFrom + insert.length },
      scrollIntoView: true,
      userEvent: "input",
    })
  } else {
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor: sel.from + insert.length },
      scrollIntoView: true,
      userEvent: "input",
    })
  }
  return true
}

/**
 * 可编辑场景使用的主题(输入框)。
 * 复用了原 rich-composer.tsx 中的样式,保证视觉零变化。
 */
export const editableTheme: Extension = EditorView.theme({
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
    color: "#9ca3af !important",
  },
})

/**
 * 只读渲染基础主题(消息气泡)。
 * 关键点:透明背景 / 继承字体 / 无 caret / 无 outline,并针对窄气泡场景校准行高。
 */
export const readonlyBaseTheme: Extension = EditorView.theme({
  "&": {
    fontSize: "14px",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    padding: "0",
    fontFamily: "inherit",
    lineHeight: "1.625",
    caretColor: "transparent",
    userSelect: "text",
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

/**
 * 深底反色主题(用户气泡)。全部继承前景色,仅用透明度区分层级。
 */
export const invertedTheme: Extension = EditorView.theme({
  ".cm-content": {
    color: "inherit",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(255,255,255,0.25) !important",
  },
})

/** 构建 markdown 语法支持(可选高亮) */
export function buildMarkdownExtensions(withHighlight: boolean): Extension[] {
  const exts: Extension[] = [markdown({ base: markdownLanguage })]
  if (withHighlight) {
    exts.push(syntaxHighlighting(defaultHighlightStyle, { fallback: true }))
  }
  return exts
}

/** 只读扩展 */
export const readOnlyExtensions: Extension[] = [
  EditorView.editable.of(false),
  EditorState.readOnly.of(true),
]

/**
 * 可编辑场景的基础扩展:
 * - history: 让 undo/redo 覆盖所有 doc 变更(包括程序化 dispatch 的
 *   文件路径插入、目录树插入、粘贴等),这样 Ctrl+Z 才能撤销。
 * - defaultKeymap / historyKeymap: 提供 Ctrl+Z / Ctrl+Y 等标准按键。
 * - scrollMargins: 光标靠近上下边缘时预留 24px 触发滚动,避免新行贴边不可见。
 */
export const editableBaseExtensions: Extension[] = [
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  EditorView.scrollMargins.of(() => ({ top: 24, bottom: 24 })),
]

/** placeholder 扩展的薄封装 */
export function buildPlaceholder(text: string): Extension {
  return placeholderExt(text)
}

/**
 * 智能换行 keymap:处理 Enter,基于当前行前导缩进与列表标记对齐下一行。
 * 用于"无 onSubmit 的可编辑场景"(如模板块),优先级低于 submit keymap 以避免冲突。
 */
export const smartNewlineKeymap: Extension = keymap.of([
  {
    key: "Enter",
    run: (view) => {
      if (view.composing) return false
      return performSmartNewline(view)
    },
  },
])

/**
 * 构建 Enter 提交 + Shift+Enter 换行的 keymap(高优先级)。
 * 通过 ref 拿到最新的 submit 回调,避免闭包过期。
 */
export function buildSubmitKeymap(
  submitRef: React.MutableRefObject<(() => void) | null>,
): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: (view) => {
          if (view.composing) return false
          submitRef.current?.()
          return true
        },
      },
      {
        key: "Shift-Enter",
        run: (view) => {
          if (view.composing) return false
          return performSmartNewline(view)
        },
      },
    ]),
  )
}

/**
 * 构建文件拖放的 dom event handler。
 * - dragover: 允许放置
 * - drop: 阻止 CodeMirror 自动读取文件内容并粘贴(必须),
 *         但不 stopPropagation,让事件冒泡到外层容器,以便 Wails 拦截。
 */
export const fileDropHandlers: Extension = EditorView.domEventHandlers({
  dragover(event) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
      return true
    }
    return false
  },
  drop(event) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault()
      return true
    }
    return false
  },
})