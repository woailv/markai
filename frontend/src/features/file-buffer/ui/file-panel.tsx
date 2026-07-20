import { languages } from "@codemirror/language-data"
import { Compartment, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import CodeMirror from "@uiw/react-codemirror"
import { AlertTriangle, FileWarning, Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef } from "react"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/features/tabs"

import { useCloseSaveHandler } from "@/shared/model"
import { FileBufferSource } from "../model/file-buffer-source"
import { useFileBuffer } from "../model/use-file-buffer"
import { classifyPath, isImagePath, languageIdOf } from "../model/viewer-registry"
import type { BufferSource } from "../model/buffer-source"

interface FilePanelProps {
  tabId: string
  /** 若不提供 source,则视作 file tab,基于 path 构造默认 FileBufferSource。 */
  source?: BufferSource
  /**
   * 用于 viewer 分派(判断 image/binary、markdown 高亮)以及 missing 提示的路径。
   * 对模板来说传一个伪路径(如 "template.md")即可。
   */
  path: string
  invalid?: boolean
  /** 附加的 CodeMirror 扩展(如模板变量占位符高亮)。 */
  extraExtensions?: Extension[]
}

/**
 * buffer(文件 / 模板)tab 的统一宿主。
 * - 中间根据 path 分派 viewer(text / image / binary)
 * - Ctrl+S 保存(仅在本 panel 是激活 tab 时生效)
 * - 无 header:标题与 dirty 状态由 tab-bar 呈现,交互与 file tab 完全对齐
 */
export function FilePanel({
  tabId,
  source,
  path,
  invalid,
  extraExtensions,
}: FilePanelProps) {
  // 默认 source(file tab):基于 path 一次性构造并稳定引用
  const effectiveSource = useMemo<BufferSource>(
    () => source ?? new FileBufferSource(path),
    // source 未提供时,path 变化才需要新建 file source
    // 提供 source 时,由上层保证 source 稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, source ? undefined : path],
  )

  const { buffer, setContent, save, reload } = useFileBuffer({
    tabId,
    source: effectiveSource,
  })
  const closeTab = useTabStore((s) => s.closeTab)

  const viewerKind = classifyPath(path)

  // Ctrl+S:保存。仅在当前是激活 tab 时生效。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() !== "s") return
      const activeTabId = useTabStore.getState().activeTabId
      if (activeTabId !== tabId) return
      e.preventDefault()
      void save()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save, tabId])

  // 注册给 close-coordinator:关闭 dirty tab 选择"保存"时会调用此 handler。
  // 返回 true 表示保存成功可关闭,false 表示失败需保持 tab 打开。
  const closeSaveHandler = useCallback(async (): Promise<boolean> => {
    const res = await save()
    if (!res.ok) {
      console.error("[file-panel] close-save failed", res.error)
      return false
    }
    return true
  }, [save])
  useCloseSaveHandler(tabId, closeSaveHandler)

  // 语言高亮通过 Compartment 动态注入,避免因 path 变更导致 CodeMirror 整体重建。
  const languageCompartmentRef = useRef<Compartment>(new Compartment())
  const editorViewRef = useRef<EditorView | null>(null)

  const cmExtensions = useMemo<Extension[]>(() => {
    const base: Extension[] = [
      languageCompartmentRef.current.of([]),
      EditorView.lineWrapping,
    ]
    return extraExtensions ? [...base, ...extraExtensions] : base
  }, [extraExtensions])

  // 根据 path 动态加载对应语言包(lazy import),完成后 reconfigure 到编辑器。
  useEffect(() => {
    let cancelled = false
    const desc = findLanguageDescription(path)
    if (!desc) {
      editorViewRef.current?.dispatch({
        effects: languageCompartmentRef.current.reconfigure([]),
      })
      return
    }
    void desc.load().then((support) => {
      if (cancelled) return
      const view = editorViewRef.current
      if (!view) return
      view.dispatch({
        effects: languageCompartmentRef.current.reconfigure(support),
      })
    })
    return () => {
      cancelled = true
    }
  }, [path])

  if (invalid) {
    return (
      <MissingFile path={path} onClose={() => closeTab(tabId)} onRetry={reload} />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-hidden">
        {buffer.status === "loading" ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>加载中…</span>
          </div>
        ) : buffer.status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="font-medium text-foreground">读取失败</div>
            <div className="max-w-md whitespace-pre-wrap break-all opacity-80">
              {buffer.error}
            </div>
            <button
              type="button"
              onClick={reload}
              className="mt-2 rounded border bg-background px-2 py-0.5 text-[11px] hover:bg-muted"
            >
              重试
            </button>
          </div>
        ) : viewerKind === "image" ? (
          <ImageViewer path={path} />
        ) : viewerKind === "binary" ? (
          <BinaryViewer path={path} />
        ) : (
          <div className="h-full overflow-hidden">
            <CodeMirror
              value={buffer.content}
              onChange={setContent}
              onCreateEditor={(view) => {
                editorViewRef.current = view
                // 首次挂载后立即触发一次语言加载(effect 已在 mount 前登记依赖,
                // 但此时 view 可能尚未就绪,这里补一次派发保证首帧后即可上色)。
                const desc = findLanguageDescription(path)
                if (desc) {
                  void desc.load().then((support) => {
                    if (editorViewRef.current !== view) return
                    view.dispatch({
                      effects:
                        languageCompartmentRef.current.reconfigure(support),
                    })
                  })
                }
              }}
              height="100%"
              theme="light"
              extensions={cmExtensions}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                autocompletion: false,
              }}
              className={cn("h-full text-[13px]")}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ImageViewer({ path }: { path: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
      <FileWarning className="h-5 w-5 opacity-60" />
      <div>图片预览尚未接入</div>
      <div className="max-w-md truncate opacity-70" title={path}>
        {path}
      </div>
    </div>
  )
}

function BinaryViewer({ path }: { path: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
      <FileWarning className="h-5 w-5 opacity-60" />
      <div>该文件类型不支持文本编辑</div>
      <div className="max-w-md truncate opacity-70" title={path}>
        {path}
      </div>
    </div>
  )
}

function MissingFile({
  path,
  onClose,
  onRetry,
}: {
  path: string
  onClose: () => void
  onRetry: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs text-muted-foreground">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div className="text-sm font-medium text-foreground">文件已失效</div>
      <div className="max-w-md break-all opacity-80" title={path}>
        {path}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded border bg-background px-2 py-1 hover:bg-muted"
        >
          重试
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border bg-background px-2 py-1 hover:bg-muted"
        >
          关闭标签
        </button>
      </div>
    </div>
  )
}

// 使用 isImagePath 静默避免 tree-shaking 警告(留给未来 v2 扩展)
void isImagePath

/**
 * 根据文件路径匹配 CodeMirror 语言描述。
 * 优先使用 @codemirror/language-data 提供的 filename/extension 匹配,
 * 覆盖 JS/TS/TSX/JSX/Go/Rust/Python/Java/Kotlin/C/C++/C#/Ruby/PHP/Swift/
 * Shell/SQL/JSON/YAML/TOML/XML/HTML/CSS/Markdown/Vue/Svelte 等主流语言。
 */
function findLanguageDescription(path: string) {
  // 优先按 languageIdOf 返回的显式 id 匹配(例如模板显式指定 markdown);
  // "plaintext" 视为无显式指定,继续按文件名/扩展名匹配。
  const explicitId = languageIdOf(path)
  if (explicitId && explicitId !== "plaintext") {
    const byName = languages.find(
      (l) =>
        l.name.toLowerCase() === explicitId.toLowerCase() ||
        l.alias.some((a) => a.toLowerCase() === explicitId.toLowerCase()),
    )
    if (byName) return byName
  }
  // 提取文件名(兼容 posix / windows 分隔符)
  const filename = path.split(/[\\/]/).pop() ?? path
  return (
    languages.find((l) => l.filename?.test(filename)) ??
    languages.find((l) => {
      const dot = filename.lastIndexOf(".")
      if (dot < 0) return false
      const ext = filename.slice(dot + 1).toLowerCase()
      return l.extensions.includes(ext)
    }) ??
    null
  )
}