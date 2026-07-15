import { useEffect } from "react"

import { useTabStore } from "@/store"

import { confirmCloseDirty } from "./close-confirm-dialog"

/**
 * 每个 dirty-aware 面板(FilePanel / 模板编辑)在挂载时把自己的"保存"函数
 * 通过 useCloseSaveHandler 注册到这里;关闭 tab 时若该 tab 是 dirty,
 * requestCloseTab 会先弹出三选一对话框,根据用户选择调用 save 或直接关闭。
 *
 * 设计取舍:不放到 zustand store,避免把不可持久化的函数塞进 state;
 * 用模块级 Map 保存回调,生命周期由注册组件的 useEffect 管理。
 */

type SaveHandler = () => Promise<boolean>
// 返回值:true = 保存成功,可以关闭;false = 保存失败,取消关闭

const saveHandlers = new Map<string, SaveHandler>()

export function useCloseSaveHandler(tabId: string, handler: SaveHandler | null) {
  useEffect(() => {
    if (!handler) return
    saveHandlers.set(tabId, handler)
    return () => {
      // 只清理仍指向当前 handler 的注册,避免热重载/竞争清掉新 handler
      if (saveHandlers.get(tabId) === handler) {
        saveHandlers.delete(tabId)
      }
    }
  }, [tabId, handler])
}

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
  const handler = saveHandlers.get(tabId)
  if (!handler) {
    // 没注册 handler 也没办法保存,退化为丢弃,避免卡死
    console.warn("[close-coordinator] no save handler for tab", tabId)
    store.closeTab(tabId)
    return true
  }
  try {
    const ok = await handler()
    if (!ok) return false
    store.closeTab(tabId)
    return true
  } catch (err) {
    console.error("[close-coordinator] save handler threw", err)
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