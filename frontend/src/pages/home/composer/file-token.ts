import { RangeSet, RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"

/**
 * 文件引用 token 在编辑器文档中的编码格式。
 * 采用通用的 Markdown 文件引用格式,便于跨系统传递与人类阅读:
 *
 *   [@<basename>](file:///<absolute-path>)
 *
 * 例如: [@index.tsx](file:///E:/goproject/prompttool/frontend/src/pages/home/index.tsx)
 *
 * 说明:
 * - 该格式即为最终发送给下游的"纯文本"表示,`documentToPlainText`
 *   不会对其做进一步展开,直接原样保留。
 * - 编辑器中通过 ViewPlugin 将其可视化为紧凑的 chip;
 *   但底层文档中真实存在的字符就是这段 Markdown。
 * - 路径中不允许出现 `)` 与换行,普通文件系统路径均可安全承载。
 */
export const FILE_TOKEN_REGEX =
    /\[@[^\]\n]+\]\(file:\/\/\/([^)\n]+)\)/g

/** 将绝对路径规范化为 URL 中的正斜杠形式(仅用于文档中的 token 编码) */
function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/")
}

/** 编码为文档 token(Markdown 引用形式) */
export function encodeFileToken(absolutePath: string): string {
  const name = basename(absolutePath)
  return `[@${name}](file:///${toForwardSlash(absolutePath).replace(/^\/+/, "")})`
}

/** 从 token 字符串中解出路径,未匹配返回 null */
export function decodeFileToken(token: string): string | null {
  FILE_TOKEN_REGEX.lastIndex = 0
  const m = FILE_TOKEN_REGEX.exec(token)
  if (!m) return null
  // 完整匹配整段
  if (m[0] !== token) return null
  return m[1]
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
 * 得到真实要发送的文本。
 *
 * 由于文档中的 token 本身已经是通用 Markdown 文件引用格式
 * (`[@name](file:///abs/path)`),此处直接原样返回,不做展开。
 * 下游可根据需要自行解析或保留原样展示。
 */
export function documentToPlainText(doc: string): string {
  return doc
}

/** 判断输入是否包含 token */
export function hasFileToken(doc: string): boolean {
  FILE_TOKEN_REGEX.lastIndex = 0
  return FILE_TOKEN_REGEX.test(doc)
}

/** Chip 呈现模式 */
export type FileChipVariant = "editable" | "readonly" | "readonly-inverted"

interface ChipStyle {
  wrap: string
  icon: string
  showClose: boolean
}

/**
 * 各变体的样式配置。
 * - editable:      输入框中,含关闭按钮 + hover 反馈
 * - readonly:      消息气泡(浅底 AI 侧),中性色 + 无交互暗示
 * - readonly-inverted: 消息气泡(深底用户侧),继承前景色 + 半透明背景
 */
const CHIP_STYLES: Record<FileChipVariant, ChipStyle> = {
  editable: {
    wrap:
        "inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 text-blue-700 dark:text-blue-300 align-baseline select-none",
    icon: "text-[10px]",
    showClose: true,
  },
  readonly: {
    // 中性、低饱和,与正文融合;去除 select-none 允许复制
    wrap:
        "inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 text-muted-foreground align-baseline cursor-text",
    icon: "text-[10px] opacity-70",
    showClose: false,
  },
  "readonly-inverted": {
    // 深底之上使用 currentColor,通过透明度制造层级
    wrap:
        "inline-flex items-center gap-1 rounded-md border border-current/30 bg-white/10 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 align-baseline cursor-text",
    icon: "text-[10px] opacity-80",
    showClose: false,
  },
}

class FileChipWidget extends WidgetType {
  constructor(
      private readonly path: string,
      private readonly from: number,
      private readonly to: number,
      private readonly variant: FileChipVariant,
  ) {
    super()
  }

  override eq(other: FileChipWidget): boolean {
    return other.path === this.path && other.variant === this.variant
  }

  toDOM(view: EditorView): HTMLElement {
    const style = CHIP_STYLES[this.variant]
    const wrap = document.createElement("span")
    wrap.className = style.wrap
    wrap.setAttribute("data-file-chip", "1")
    wrap.setAttribute("data-variant", this.variant)
    wrap.title = this.path

    const icon = document.createElement("span")
    icon.textContent = "📎"
    icon.className = style.icon
    wrap.appendChild(icon)

    const label = document.createElement("span")
    label.textContent = basename(this.path)
    wrap.appendChild(label)

    if (style.showClose) {
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
    }

    return wrap
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/**
 * 工厂:根据变体创建 ViewPlugin。
 * 将 token 替换为原子装饰:
 *   - 左右方向键跨越整个 token,不进入内部
 *   - Backspace / Delete 一次删除整个 token(仅可编辑态有效)
 *   - 鼠标点击 token 中部,光标吸附到就近的边缘
 */
export function createFileChipPlugin(variant: FileChipVariant) {
  return ViewPlugin.fromClass(
      class {
        decorations: DecorationSet
        atomics: RangeSet<Decoration>

        constructor(view: EditorView) {
          this.decorations = this.build(view)
          this.atomics = this.buildAtomics(view)
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.build(update.view)
            this.atomics = this.buildAtomics(update.view)
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
                    widget: new FileChipWidget(m[1], start, end, variant),
                    inclusive: false,
                  }),
              )
            }
          }
          return builder.finish()
        }

        /**
         * 扫描整个文档(而不只是可视区域)构建 atomicRanges,
         * 避免视口外的 token 失去原子性导致光标进入内部。
         */
        buildAtomics(view: EditorView): RangeSet<Decoration> {
          const builder = new RangeSetBuilder<Decoration>()
          const text = view.state.doc.toString()
          let m: RegExpExecArray | null
          FILE_TOKEN_REGEX.lastIndex = 0
          while ((m = FILE_TOKEN_REGEX.exec(text))) {
            const start = m.index
            const end = start + m[0].length
            builder.add(start, end, Decoration.mark({}))
          }
          return builder.finish()
        }
      },
      {
        decorations: (v) => v.decorations,
        provide: (plugin) =>
            EditorView.atomicRanges.of(
                (view) => view.plugin(plugin)?.atomics ?? RangeSet.empty,
            ),
      },
  )
}

/** 输入框中使用的可编辑 chip(保持既有导出名以避免破坏输入侧调用) */
export const fileChipPlugin = createFileChipPlugin("editable")

/** 只读消息(AI 侧浅底)使用的展示型 chip */
export const readOnlyFileChipPlugin = createFileChipPlugin("readonly")

/** 只读消息(用户侧深底)使用的反色展示型 chip */
export const readOnlyInvertedFileChipPlugin =
    createFileChipPlugin("readonly-inverted")