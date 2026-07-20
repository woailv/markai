import { useEffect } from "react"

/**
 * 全局"未保存 tab → 保存处理器"注册表。
 *
 * 每个 dirty-aware 面板(如 FilePanel / 模板编辑)在挂载时,通过
 * useCloseSaveHandler 把自身的"保存"回调注册进来;关闭 tab 前的三选一
 * 对话框会来这里查询并执行。
 *
 * 抽到 shared 是为了避免 features/file-buffer 反向依赖 features/tabs;
 * tabs 侧通过 getSaveHandler 消费注册结果即可。
 *
 * 设计取舍:不放到 zustand store,避免把不可持久化的函数塞进 state;
 * 用模块级 Map 保存回调,生命周期由注册组件的 useEffect 管理。
 */

export type SaveHandler = () => Promise<boolean>

const saveHandlers = new Map<string, SaveHandler>()

export function useCloseSaveHandler(
  tabId: string,
  handler: SaveHandler | null,
) {
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

export function getSaveHandler(tabId: string): SaveHandler | undefined {
  return saveHandlers.get(tabId)
}
