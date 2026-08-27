/**
 * 文件拖拽取消的全局协调。
 *
 * 背景:按 ESC / 拖出窗口等取消"系统级文件拖拽"时,Wails 仍可能派发
 * files:dropped,若不拦截文件会被照常插入。因此需要一个前端侧"已取消"
 * 标记,所有落点处理器在收到 drop 事件时先消费该标记判断是否忽略;同时
 * 在此统一于 window 层安装兜底监听,清空各落点的拖拽视觉态。
 *
 * 注意区分两类兜底:
 *   - 真取消(ESC、拖出窗口):标记已取消 + 清理视觉态。
 *   - 正常收尾(真实 drop、dragend、窗口失焦):只清理视觉态,不标记取消,
 *     否则会误伤"正常落子后紧接着到来的 files:dropped 插入"。
 */

const clearCallbacks = new Set<() => void>()

/** 最近一次"标记取消"的时间戳;窗口期内 consume 视为已取消。 */
let cancelledAt = 0

/** 取消判定窗口(ms)。设为较短值,避免"已取消"标记残留影响刚结束的拖拽后的下一次合法落子。 */
const CANCEL_WINDOW_MS = 1000

/** 注册"清空拖拽视觉态"回调(组件进入拖拽态时调用),返回解除函数。 */
export function onFileDragCancel(clear: () => void): () => void {
  clearCallbacks.add(clear)
  return () => {
    clearCallbacks.delete(clear)
  }
}

/** 标记本次拖拽已取消,并触发所有落点清理视觉态。 */
function markCancelled(): void {
  cancelledAt = Date.now()
  for (const clear of clearCallbacks) clear()
}

/** 仅清空所有落点视觉态,不标记取消。 */
function clearVisual(): void {
  for (const clear of clearCallbacks) clear()
}

/**
 * drop 处理器消费取消标记:若在取消窗口期内刚发生过取消,返回 true,
 * 调用方应忽略本次插入并复位视觉态。
 */
export function consumeFileDragCancelled(): boolean {
  const wasCancelled = Date.now() - cancelledAt < CANCEL_WINDOW_MS
  if (wasCancelled) cancelledAt = 0
  return wasCancelled
}

let installed = false

/** 幂等安装全局拖拽取消兜底监听。供应用侧调用一次。 */
export function installGlobalFileDragCancel(): void {
  if (installed) return
  installed = true

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") markCancelled()
  }
  const onWindowLeave = (e: DragEvent) => {
    // relatedTarget 为 null 表示光标离开了整个窗口,视为取消
    if (e.relatedTarget === null) markCancelled()
  }

  window.addEventListener("dragend", clearVisual, true)
  window.addEventListener("drop", clearVisual, true)
  window.addEventListener("dragleave", onWindowLeave, true)
  window.addEventListener("keydown", onKey, true)
  window.addEventListener("blur", clearVisual, true)
}
