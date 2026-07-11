import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language"
import { RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"

// {{variable}} 占位
const VAR_RE = /\{\{\s*[\w.-]+\s*\}\}/g
// 文件路径:@src/foo.ts 或 ./a/b.tsx 或 绝对路径 E:\xxx\yy.ts
const PATH_RE =
  /(@[\w./\\-]+\.[a-zA-Z0-9]+)|((?:\.{1,2}\/|[a-zA-Z]:[\\/])[\w./\\-]+\.[a-zA-Z0-9]+)/g

const varMark = Decoration.mark({ class: "cm-tpl-var" })
const pathMark = Decoration.mark({ class: "cm-tpl-path" })

function buildDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    const hits: { start: number; end: number; deco: Decoration }[] = []
    let m: RegExpExecArray | null
    VAR_RE.lastIndex = 0
    while ((m = VAR_RE.exec(text))) {
      hits.push({
        start: from + m.index,
        end: from + m.index + m[0].length,
        deco: varMark,
      })
    }
    PATH_RE.lastIndex = 0
    while ((m = PATH_RE.exec(text))) {
      hits.push({
        start: from + m.index,
        end: from + m.index + m[0].length,
        deco: pathMark,
      })
    }
    hits.sort((a, b) => a.start - b.start || a.end - b.end)
    for (const h of hits) builder.add(h.start, h.end, h.deco)
  }
  return builder.finish()
}

const highlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecos(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecos(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

const theme = EditorView.theme({
  "&": { fontSize: "13px" },
  ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  ".cm-tpl-var": {
    backgroundColor: "rgba(59,130,246,0.15)",
    color: "rgb(37,99,235)",
    borderRadius: "3px",
    padding: "0 2px",
  },
  ".cm-tpl-path": {
    color: "rgb(217,119,6)",
    textDecoration: "underline",
    textDecorationStyle: "dotted",
  },
  ".cm-focused": { outline: "none" },
})

export const promptExtensions = [
  highlightPlugin,
  theme,
  syntaxHighlighting(defaultHighlightStyle),
  EditorView.lineWrapping,
]