/**
 * Template chip 装饰:将 template token 替换为紧凑的可视 chip,
 * 结构与 file-chip 保持一致以便未来抽象共享。
 *
 * 三种视觉变体:
 *  - editable:           输入框中(当前尚未使用,保留一致性)
 *  - readonly:           AI 消息气泡(浅底)
 *  - readonly-inverted:  用户消息气泡(深底)
 *
 * chip 上不带关闭按钮 —— 模板在业务侧通过工具栏选择/取消,
 * 不允许在消息里手动删除已发送的模板引用。
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

import { TEMPLATE_TOKEN_REGEX } from "./template-token-utils"

export type TemplateChipVariant = "editable" | "readonly" | "readonly-inverted"

interface ChipStyle {
  wrap: string
  icon: string
}

const CHIP_STYLES: Record<TemplateChipVariant, ChipStyle> = {
  editable: {
    wrap:
      "inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 text-emerald-700 dark:text-emerald-300 align-baseline select-none",
    icon: "text-[10px]",
  },
  readonly: {
    wrap:
      "inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 text-emerald-700 dark:text-emerald-300 align-baseline cursor-text",
    icon: "text-[10px] opacity-70",
  },
  "readonly-inverted": {
    wrap:
      "inline-flex items-center gap-1 rounded-md border border-current/30 bg-white/10 px-1.5 py-[1px] mx-[1px] font-mono text-[11px] leading-4 align-baseline cursor-text",
    icon: "text-[10px] opacity-80",
  },
}

class TemplateChipWidget extends WidgetType {
  constructor(
    private readonly name: string,
    private readonly id: string,
    private readonly variant: TemplateChipVariant,
  ) {
    super()
  }

  override eq(other: TemplateChipWidget): boolean {
    return (
      other.name === this.name &&
      other.id === this.id &&
      other.variant === this.variant
    )
  }

  toDOM(): HTMLElement {
    const style = CHIP_STYLES[this.variant]
    const wrap = document.createElement("span")
    wrap.className = style.wrap
    wrap.setAttribute("data-template-chip", "1")
    wrap.setAttribute("data-variant", this.variant)
    wrap.title = `模板: ${this.name}`

    const icon = document.createElement("span")
    icon.textContent = "📋"
    icon.className = style.icon
    wrap.appendChild(icon)

    const label = document.createElement("span")
    label.textContent = this.name
    wrap.appendChild(label)

    return wrap
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/**
 * 工厂:根据变体创建 ViewPlugin。
 */
export function createTemplateChipPlugin(variant: TemplateChipVariant) {
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
          const re = new RegExp(TEMPLATE_TOKEN_REGEX.source, "g")
          let m: RegExpExecArray | null
          while ((m = re.exec(text))) {
            const start = from + m.index
            const end = start + m[0].length
            builder.add(
              start,
              end,
              Decoration.replace({
                widget: new TemplateChipWidget(m[1], m[2], variant),
                inclusive: false,
              }),
            )
          }
        }
        return builder.finish()
      }

      buildAtomics(view: EditorView): RangeSet<Decoration> {
        const builder = new RangeSetBuilder<Decoration>()
        const text = view.state.doc.toString()
        const re = new RegExp(TEMPLATE_TOKEN_REGEX.source, "g")
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