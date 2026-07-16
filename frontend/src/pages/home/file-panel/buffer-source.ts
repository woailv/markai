/**
 * BufferSource:统一 file / template 两种数据源的最小接口。
 *
 * 设计要点:
 *  - use-file-buffer 只跟 source 打交道,不再直接触碰 FileService / templateStore。
 *  - load/save 语义对齐"读到当前完整文本,写回并返回新的 mtime/size"。
 *  - subscribe 让 source 主动通知外部变化(文件被外部改动 / 模板在别处更新)。
 *  - key 用于 use-file-buffer 判断 source 是否变化,不做业务用途。
 *
 * mtime/size 仅对 file 有语义;template source 全返 0 即可,配合乐观并发窗口跳过校验。
 */
export interface BufferLoadResult {
  content: string
  modTime: number
  size: number
}

export interface BufferSaveResult {
  ok: boolean
  error?: string
  /** 保存成功后的最新 mtime,失败可省略 */
  modTime?: number
  /** 保存成功后的最新 size,失败可省略 */
  size?: number
}

export interface BufferExternalChange {
  /** modified:内容被外部改动;需要刷新或提示 */
  type: "modified" | "removed" | "renamed"
  /** rename 时的新标识(file 是新路径),modify/remove 时忽略 */
  newKey?: string
}

export interface BufferSource {
  /** 稳定标识,use-file-buffer 用来判断 source 是否发生了业务级变化 */
  readonly key: string
  /** 是否支持 mtime 乐观并发。file=true, template=false。 */
  readonly usesModTime: boolean
  load(): Promise<BufferLoadResult>
  save(content: string, expectedModTime: number): Promise<BufferSaveResult>
  /**
   * 订阅外部变化。返回取消函数。
   * cb 触发后,use-file-buffer 会按 dirty 状态决定重载或提示。
   */
  subscribe(cb: (change: BufferExternalChange) => void): () => void
}