import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language"
import { RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"

const VAR_RE = /\{\{\s*[\w.-]+\s*\}\}/g
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
  "&": { fontSize: "13px", backgroundColor: "transparent" },
  ".cm-content": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, 'JetBrains Mono', monospace",
    padding: "6px 4px",
    caretColor: "hsl(var(--primary))",
  },
  ".cm-gutters": { backgroundColor: "transparent", border: "none" },
  ".cm-tpl-var": {
    backgroundColor: "rgba(59,130,246,0.12)",
    color: "rgb(37,99,235)",
    borderRadius: "3px",
    padding: "0 3px",
    fontWeight: "500",
  },
  ".cm-tpl-path": {
    color: "rgb(180,83,9)",
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: "3px",
    padding: "0 2px",
    textDecoration: "underline",
    textDecorationStyle: "dotted",
    textUnderlineOffset: "2px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-focused": { outline: "none" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-cursor": { borderLeftColor: "hsl(var(--primary))" },
  ".cm-placeholder": { color: "hsl(var(--muted-foreground))", opacity: "0.5" },
})

export const promptExtensions = [
  highlightPlugin,
  theme,
  syntaxHighlighting(defaultHighlightStyle),
  EditorView.lineWrapping,
]