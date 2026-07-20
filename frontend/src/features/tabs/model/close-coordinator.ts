import { getSaveHandler } from "@/shared/model"

import { useTabStore } from "./tab.store"
import { confirmCloseDirty } from "../ui/close-confirm-dialog"

/**
 * requestCloseTab 是所有 tab 关闭入口的唯一出口:
 * dirty 时弹出三选一(保存 / 丢弃 / 取消),否则直接关闭。
 *
 * 保存回调由 dirty-aware 面板通过 shared/model 的 useCloseSaveHandler 注册,
 * 这里只从注册表里查询并调用,避免 tabs 反向依赖 file-buffer / template 编辑。
 */

function isDirty(tabId: string): { dirty: boolean; title: string } {
  const t = useTabStore.getState().tabs.find((x) => x.id === tabId)
  if (!t) return { dirty: false, title: "" }
  const dirty =
    (t.kind === "file" && !!t.dirty) ||
    (t.kind === "template" && !!t.dirty)
  return { dirty, title: t.title }
}

/**
 * 请求关闭一个 tab:dirty 时先询问用户,否则直接关闭。
 * 供 TabItem 关闭按钮、中键关闭、Ctrl+W、右键菜单等所有关闭入口统一调用。
 */
export async function requestCloseTab(tabId: string): Promise<boolean> {
  const { dirty, title } = isDirty(tabId)
  const store = useTabStore.getState()
  if (!dirty) {
    store.closeTab(tabId)
    return true
  }
  const choice = await confirmCloseDirty({
    title: "关闭未保存的更改",
    description: `"${title}" 有未保存的改动,是否保存?`,
  })
  if (choice === "cancel") return false
  if (choice === "discard") {
    store.closeTab(tabId)
    return true
  }
  // save
  const handler = getSaveHandler(tabId)
  if (!handler) {
    // 没注册 handler:无法保存,不能悄悄丢弃用户改动,退化为取消关闭
    console.warn("[close-coordinator] no save handler for tab", tabId)
    window.alert(`无法保存 "${title}":未注册保存处理器,已取消关闭。`)
    return false
  }
  try {
    const ok = await handler()
    if (!ok) {
      // 保存失败:保持 tab 打开,提示用户,避免"点了保存但静默失败"
      window.alert(`保存 "${title}" 失败,已取消关闭。请检查后重试。`)
      return false
    }
    // 关闭前再确认 tab 状态已经不是 dirty,防止 handler 声称成功但状态未同步
    const after = useTabStore.getState().tabs.find((x) => x.id === tabId)
    if (after) {
      const stillDirty =
        (after.kind === "file" && !!after.dirty) ||
        (after.kind === "template" && !!after.dirty)
      if (stillDirty) {
        console.error(
          "[close-coordinator] save handler returned true but tab is still dirty",
          tabId,
        )
        window.alert(`保存 "${title}" 未生效,已取消关闭。`)
        return false
      }
    }
    store.closeTab(tabId)
    return true
  } catch (err) {
    console.error("[close-coordinator] save handler threw", err)
    window.alert(`保存 "${title}" 出错:${(err as Error)?.message ?? err}`)
    return false
  }
}

/**
 * 批量关闭:遇到 dirty 逐个询问,任一取消则中止,返回是否全部关闭成功。
 */
export async function requestCloseTabs(tabIds: string[]): Promise<boolean> {
  for (const id of tabIds) {
    // 每次都重新读取 state,tab 可能已经被上一步关闭合并
    const stillOpen = useTabStore.getState().tabs.some((t) => t.id === id)
    if (!stillOpen) continue
    const ok = await requestCloseTab(id)
    if (!ok) return false
  }
  return true
}
