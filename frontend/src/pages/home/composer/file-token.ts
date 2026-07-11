import { RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"

/**
 * 文件引用 token 在编辑器文档中的编码格式。
 * 使用不可见的角括号,避免与用户正常输入冲突。
 *
 * 形如: ⟦file:/absolute/path/to/file.ext⟧
 */
const TOKEN_OPEN = "\u27E6file:"
const TOKEN_CLOSE = "\u27E7"

export const FILE_TOKEN_REGEX = /\u27E6file:([^\u27E7]+)\u27E7/g

/** 编码为文档 token */
export function encodeFileToken(absolutePath: string): string {
  return `${TOKEN_OPEN}${absolutePath}${TOKEN_CLOSE}`
}

/** 从 token 字符串中解出路径,未匹配返回 null */
export function decodeFileToken(token: string): string | null {
  if (!token.startsWith(TOKEN_OPEN) || !token.endsWith(TOKEN_CLOSE)) return null
  return token.slice(TOKEN_OPEN.length, token.length - TOKEN_CLOSE.length)
}

/** 提取路径的 basename(兼容 Windows 与 POSIX 分隔符) */
export function basename(p: string): string {
  const normalized = p.replace(/[\\/]+$/, "")
  const idx = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  )
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/**
 * 将文档中的文件 token 还原为原始路径,得到真实要发送的文本。
 */
export function documentToPlainText(doc: string): string {
  return doc.replace(FILE_TOKEN_REGEX, (_, p1: string) => p1)
}

/** 判断输入是否包含 token */
export function hasFileToken(doc: string): boolean {
  FILE_TOKEN_REGEX.lastIndex = 0
  return FILE_TOKEN_REGEX.test(doc)
}

class FileChipWidget extends WidgetType {
  constructor(
    private readonly path: string,
    private readonly from: number,
    private readonly to: number,
  ) {
    super()
  }

  override eq(other: FileChipWidget): boolean {
    return other.path === this.path
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span")
    wrap.className =
      "inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 text-blue-700 dark:text-blue-300 align-baseline select-none"
    wrap.setAttribute("data-file-chip", "1")
    wrap.title = this.path

    const icon = document.createElement("span")
    icon.textContent = "📎"
    icon.className = "text-[10px]"
    wrap.appendChild(icon)

    const label = document.createElement("span")
    label.textContent = basename(this.path)
    wrap.appendChild(label)

    const close = document.createElement("button")
    close.type = "button"
    close.textContent = "×"
    close.className =
      "ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded text-[12px] leading-none text-blue-700/70 hover:bg-blue-500/20 hover:text-blue-900 dark:text-blue-300/70"
    close.setAttribute("aria-label", `移除 ${basename(this.path)}`)
    close.addEventListener("mousedown", (e) => {
      // 阻止编辑器抢焦点与选区变更
      e.preventDefault()
      e.stopPropagation()
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: "" },
      })
    })
    wrap.appendChild(close)

    return wrap
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/**
 * ViewPlugin: 扫描可视区域内的文件 token,替换为原子装饰。
 */
export const fileChipPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view)
      }
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to)
        let m: RegExpExecArray | null
        FILE_TOKEN_REGEX.lastIndex = 0
        while ((m = FILE_TOKEN_REGEX.exec(text))) {
          const start = from + m.index
          const end = start + m[0].length
          builder.add(
            start,
            end,
            Decoration.replace({
              widget: new FileChipWidget(m[1], start, end),
              inclusive: false,
            }),
          )
        }
      }
      return builder.finish()
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)