import { markdown } from "@codemirror/lang-markdown"
import { EditorView } from "@codemirror/view"
import CodeMirror from "@uiw/react-codemirror"
import { AlertTriangle, FileWarning, Loader2 } from "lucide-react"
import { useCallback, useEffect } from "react"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/store"

import { useCloseSaveHandler } from "../tabs/close-coordinator"
import { useFileBuffer } from "./use-file-buffer"
import { classifyPath, isImagePath, languageIdOf } from "./viewer-registry"

interface FilePanelProps {
  tabId: string
  path: string
  invalid?: boolean
}

/**
 * 单个 file tab 的宿主。
 * - 中间根据文件类型分派 viewer
 * - Ctrl+S 保存(仅在本 panel 聚焦时生效)
 */
export function FilePanel({ tabId, path, invalid }: FilePanelProps) {
  const { buffer, setContent, save, reload } =
    useFileBuffer({ tabId, path })
  const closeTab = useTabStore((s) => s.closeTab)

  const viewerKind = classifyPath(path)

  // Ctrl+S:保存;Ctrl+Shift+P 预留。仅在当前是激活 tab 时生效。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() !== "s") return
      const activeTabId = useTabStore.getState().activeTabId
      if (activeTabId !== tabId) return
      // 忽略聚焦在其他 chat/template tab 内的情况(activeTabId 已经过滤)
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
              height="100%"
              theme="light"
              extensions={
                languageIdOf(path) === "markdown"
                  ? [markdown(), EditorView.lineWrapping]
                  : [EditorView.lineWrapping]
              }
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
  // Wails 目前不方便直接把绝对路径喂给 <img src>,先展示占位说明。
  // v2 可通过后端 base64 或 asset handler 实现真实渲染。
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
