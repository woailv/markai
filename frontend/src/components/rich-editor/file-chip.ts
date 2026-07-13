/**
 * File chip 装饰:将 file token 替换为紧凑的可视 chip,
 * 并通过 atomicRanges 实现光标跨越、整体删除等原子行为。
 *
 * 三种视觉变体:
 *  - editable:           输入框中,含关闭按钮 + hover 反馈
 *  - readonly:           AI 消息气泡(浅底),中性色 + 无交互暗示
 *  - readonly-inverted:  用户消息气泡(深底主色),继承前景色 + 半透明背景
 *
 * 视觉变体由内核根据 mode 自动选择,外层业务不应直接引用具体变体。
 */
import { RangeSet, RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"

import { FILE_TOKEN_REGEX, basename } from "./file-path-utils"

export type FileChipVariant = "editable" | "readonly" | "readonly-inverted"

interface ChipStyle {
  wrap: string
  icon: string
  showClose: boolean
}

const CHIP_STYLES: Record<FileChipVariant, ChipStyle> = {
  editable: {
    wrap:
      "inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 text-blue-700 dark:text-blue-300 align-baseline select-none",
    icon: "text-[10px]",
    showClose: true,
  },
  readonly: {
    wrap:
      "inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 text-muted-foreground align-baseline cursor-text",
    icon: "text-[10px] opacity-70",
    showClose: false,
  },
  "readonly-inverted": {
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
 * - 左右方向键跨越整个 token,不进入内部
 * - Backspace / Delete 一次删除整个 token(仅可编辑态有效)
 * - 鼠标点击 token 中部,光标吸附到就近的边缘
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
          const re = new RegExp(FILE_TOKEN_REGEX.source, "g")
          let m: RegExpExecArray | null
          while ((m = re.exec(text))) {
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
        const re = new RegExp(FILE_TOKEN_REGEX.source, "g")
        let m: RegExpExecArray | null
        while ((m = re.exec(text))) {
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