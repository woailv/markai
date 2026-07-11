import { Braces, FileCode2, Keyboard } from "lucide-react"

import type { TemplateBlock } from "./types"
import {
  extractPaths,
  extractVariables,
} from "./variable-utils"

interface EditorSidebarProps {
  blocks: TemplateBlock[]
}

export function EditorSidebar({ blocks }: EditorSidebarProps) {
  const vars = extractVariables(blocks)
  const paths = extractPaths(blocks)

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
      <Section
        icon={<Braces className="h-3.5 w-3.5" />}
        title="变量"
        count={vars.length}
        empty="使用 {{name}} 语法插入变量"
      >
        {vars.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {vars.map((v) => (
              <li
                key={v}
                className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
              >
                {`{{${v}}}`}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        icon={<FileCode2 className="h-3.5 w-3.5" />}
        title="文件引用"
        count={paths.length}
        empty="引用 @src/foo.ts 会被高亮"
      >
        {paths.length > 0 && (
          <ul className="flex flex-col gap-1">
            {paths.map((p) => (
              <li
                key={p}
                className="truncate rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
                title={p}
              >
                {p}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        icon={<Keyboard className="h-3.5 w-3.5" />}
        title="快捷键"
      >
        <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <Shortcut keys={["Ctrl", "S"]} desc="保存" />
          <Shortcut keys={["Ctrl", "Enter"]} desc="新增块" />
          <Shortcut keys={["Esc"]} desc="返回列表" />
        </ul>
      </Section>
    </aside>
  )
}

interface SectionProps {
  icon: React.ReactNode
  title: string
  count?: number
  empty?: string
  children?: React.ReactNode
}

function Section({ icon, title, count, empty, children }: SectionProps) {
  const isEmpty =
    !children ||
    (Array.isArray(children) && children.length === 0) ||
    count === 0

  return (
    <section className="rounded-lg border bg-muted/30 p-3">
      <header className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
        {count !== undefined && (
          <span className="ml-auto rounded-full bg-background px-1.5 text-[10px] tabular-nums">
            {count}
          </span>
        )}
      </header>
      {isEmpty ? (
        empty && (
          <p className="text-xs text-muted-foreground/70">{empty}</p>
        )
      ) : (
        children
      )}
    </section>
  )
}

function Shortcut({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <li className="flex items-center justify-between">
      <span>{desc}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] shadow-sm"
          >
            {k}
          </kbd>
        ))}
      </span>
    </li>
  )
}