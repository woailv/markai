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
    lineHeight: "1.5",
  },
  ".cm-scroller": {
    overflow: "auto",
    maxHeight: "200px",
    fontFamily: "inherit",
  },
  // placeholder 默认作为行内元素参与 .cm-line 布局,一旦启用了 lineWrapping
  // 且文本较长,会换行撑高 .cm-line 的 content box,导致 .cm-cursor 高度
  // 跟着变高。把它设为 absolute,并强制单行 + 溢出隐藏,让它完全脱离
  // 行盒布局,只作为提示层浮在第一行上。
  // 注意:absolute + top:0 会让 placeholder 的 box 高度坍缩到内容高度,
  // 在某些字体/缩放下会把下半部分字形裁掉。这里显式给 line-height 和
  // display:block,保证有完整的行高盒来容纳字形。
  ".cm-line": {
    padding: "0",
    position: "relative",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-placeholder": {
    color: "#9ca3af !important",
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    display: "block",
    lineHeight: "1.5",
    height: "1.5em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none",
  },
  // 保证 .cm-cursor 始终有非零尺寸,避免 IME 在 caret rect 为空时
  // 把候选框定位到屏幕 (0,0)。
  ".cm-cursor, .cm-cursor-primary": {
    borderLeftWidth: "1px",
    minHeight: "1em",
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
 *
 * 职责:
 * - dragover:  允许放置;顺便发出 `richeditor-file-drag-start` 自定义事件,
 *              让外层容器可以据此设置"拖入中"的视觉态(灰色边框)。
 *              同时启用一次性的 window 级兜底监听器,确保以下场景都能
 *              可靠地清除视觉态:
 *                * 拖出编辑器区域          → dragleave (window)
 *                * 按 ESC 取消系统级拖拽    → keydown(Escape) / dragend
 *                * 文件在编辑器外被 drop    → drop (window)
 *                * 浏览器窗口失焦          → window.blur
 *              浏览器对"OS 文件拖拽 + ESC"不会向 drop 目标派发 dragleave,
 *              也不会派发 dragend(拖拽源在窗口外),因此必须在 window
 *              层布置多重兜底。
 * - dragleave: 仅当鼠标真的离开了编辑器(而非进入子节点)时才通知外层。
 * - drop:      阻止 CodeMirror 自动读取文件内容并粘贴(必须),
 *              并通知外层"拖放结束",清除视觉态。
 *              不 stopPropagation,让事件冒泡到外层容器以便 Wails 拦截。
 */
const DRAG_START_EVENT = "richeditor-file-drag-start"
const DRAG_END_EVENT = "richeditor-file-drag-end"

/** 触发一个冒泡的自定义事件,让外层容器同步状态 */
function fireDragEvent(target: HTMLElement, name: string): void {
  target.dispatchEvent(new CustomEvent(name, { bubbles: true }))
}

/**
 * 为某个编辑器 DOM 安装一次性的 window 兜底监听器。
 * 通过闭包内的 `installed` 标志避免重复安装(dragover 会持续触发)。
 */
const FALLBACK_INSTALLED = new WeakSet<HTMLElement>()

function installDragFallback(dom: HTMLElement): void {
  if (FALLBACK_INSTALLED.has(dom)) return
  FALLBACK_INSTALLED.add(dom)

  const cleanup = () => {
    FALLBACK_INSTALLED.delete(dom)
    window.removeEventListener("dragend", onEnd, true)
    window.removeEventListener("drop", onEnd, true)
    window.removeEventListener("dragleave", onWindowLeave, true)
    window.removeEventListener("keydown", onKey, true)
    window.removeEventListener("blur", onEnd, true)
    fireDragEvent(dom, DRAG_END_EVENT)
  }

  const onEnd = () => cleanup()

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup()
  }

  // window 级 dragleave:当 relatedTarget 为 null 时,说明鼠标离开了整个窗口。
  const onWindowLeave = (e: DragEvent) => {
    if (e.relatedTarget === null) cleanup()
  }

  window.addEventListener("dragend", onEnd, true)
  window.addEventListener("drop", onEnd, true)
  window.addEventListener("dragleave", onWindowLeave, true)
  window.addEventListener("keydown", onKey, true)
  window.addEventListener("blur", onEnd, true)
}

export const fileDropHandlers: Extension = EditorView.domEventHandlers({
  dragover(event, view) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
      fireDragEvent(view.dom, DRAG_START_EVENT)
      installDragFallback(view.dom)
      return true
    }
    return false
  },
  dragleave(event, view) {
    // 仅当离开编辑器根节点(而不是移到子节点上)时才通知外层。
    // 若 relatedTarget 仍位于编辑器内部,忽略。
    const next = event.relatedTarget as Node | null
    if (next && view.dom.contains(next)) return false
    fireDragEvent(view.dom, DRAG_END_EVENT)
    return false
  },
  drop(event, view) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault()
      fireDragEvent(view.dom, DRAG_END_EVENT)
      return true
    }
    fireDragEvent(view.dom, DRAG_END_EVENT)
    return false
  },
})

/** 拖拽状态自定义事件的名字,供外层容器订阅 */
export const RICH_EDITOR_DRAG_EVENTS = {
  START: DRAG_START_EVENT,
  END: DRAG_END_EVENT,
} as const