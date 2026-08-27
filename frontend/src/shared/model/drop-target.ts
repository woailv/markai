/**
 * 文件拖放落点解析的纯逻辑。
 *
 * 背景:应用里有多个可接收文件落点(data-file-drop-target):消息输入框、
 * 消息编辑器、会话消息区域(代理到输入框)。当这些目标存在嵌套关系时
 * (消息编辑器/消息内容都位于会话消息区域内部),不能简单取"第一个命中的
 * 目标",而必须选"最具体(嵌套最深)"的那个,否则丢失位于内部的具体目标。
 *
 * 因此把"判定落点赢家"抽成单一函数,所有监听 files:dropped 的目标复用,
 * 保证判定规则全局一致。
 */

import { WORKSPACE_PATHS_MIME } from "@/shared/config"

/** 文件落点根选择器:所有允许接收文件的目标都打上该属性。 */
const FILE_DROP_TARGET_SELECTOR = '[data-file-drop-target="true"]'

/**
 * 判断 DataTransfer 是否携带可插入的可拖放载荷(外部文件或工作区路径)。
 */
export function hasDroppableFiles(
  dt: DataTransfer | null | undefined,
): boolean {
  if (!dt) return false
  const types = dt.types
  if (!types) return false
  const arr = Array.from(types)
  return arr.includes("Files") || arr.includes(WORKSPACE_PATHS_MIME)
}

/**
 * 以坐标判定本次拖放赢家 —— 返回包含落点且嵌套最深(最具体)的目标。
 *
 * elementsFromPoint 从最顶层元素向下返回;对每个元素,收集所有包含它的目标,
 * 在其中取"被其它目标包含最多者"(即层级最深),从而让消息编辑器/消息内容
 * 优先于包围它们的会话消息区域,让输入框优先于其内部的具体内容。
 */
export function resolveFileDropTarget(
  x: number,
  y: number,
): HTMLElement | null {
  const targets = Array.from(
    document.querySelectorAll<HTMLElement>(FILE_DROP_TARGET_SELECTOR),
  )
  if (targets.length === 0) return null

  // 每个目标内嵌了几层其它目标(嵌套越深越具体)。
  const depthOf = (t: HTMLElement) =>
    targets.reduce(
      (acc, other) => (other !== t && other.contains(t) ? acc + 1 : acc),
      0,
    )

  const stack = document.elementsFromPoint(x, y)
  for (const el of stack) {
    if (!el) continue
    let best: HTMLElement | null = null
    let bestDepth = -1
    for (const t of targets) {
      if (!t.contains(el)) continue
      const depth = depthOf(t)
      if (depth > bestDepth) {
        bestDepth = depth
        best = t
      }
    }
    if (best) return best
  }
  return null
}