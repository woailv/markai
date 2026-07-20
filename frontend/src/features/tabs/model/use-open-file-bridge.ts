import { useEffect } from "react"

import { onOpenFileRequest } from "@/shared/model"

import { useTabStore } from "./tab.store"

/**
 * useOpenFileBridge 把 shared/model 的 requestOpenFile 派发到 tab store。
 *
 * 由页面根组件在 mount 时调用一次,让 workspace / assistant 等任何位置
 * 都能通过 requestOpenFile 打开文件而无需反向依赖 tabs 特性。
 */
export function useOpenFileBridge() {
  useEffect(() => {
    return onOpenFileRequest((req) => {
      const s = useTabStore.getState()
      if (req.mode === "preview") {
        s.openFilePreview(req.path, req.name)
      } else {
        s.openFile(req.path, req.name)
      }
    })
  }, [])
}
