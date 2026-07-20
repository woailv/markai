/**
 * 打开文件请求的极简 pub/sub。
 *
 * 目的:打断 assistant / workspace 等 UI → tabs 的反向依赖。任何 UI
 * 需要"打开这个文件"时调用 requestOpenFile;tabs 侧在应用启动时订阅
 * onOpenFileRequest,把请求映射到自己的 openFile / openFilePreview action。
 *
 * mode:
 *   - "pin" 常驻 tab(双击、Ctrl+Click 等强意图)
 *   - "preview" 预览 tab(单击等弱意图,复用同一预览槽)
 *
 * 不放到 zustand:回调不需要跨渲染共享,模块级 Set 生命周期就够用。
 */

export type OpenFileMode = "pin" | "preview"

export interface OpenFileRequest {
  path: string
  /** 展示名。缺省由 tabs 侧根据 path 推断 basename。 */
  name?: string
  /** 默认 "pin"(等价于旧 openFile 行为)。 */
  mode?: OpenFileMode
}

type Handler = (req: OpenFileRequest) => void

const handlers = new Set<Handler>()

export function onOpenFileRequest(handler: Handler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

export function requestOpenFile(
  pathOrReq: string | OpenFileRequest,
  name?: string,
  mode: OpenFileMode = "pin",
) {
  const req: OpenFileRequest =
    typeof pathOrReq === "string" ? { path: pathOrReq, name, mode } : pathOrReq
  if (handlers.size === 0) {
    console.warn("[open-file-request] no subscriber for path", req.path)
    return
  }
  for (const h of handlers) h(req)
}
