import { useTabStore, useTemplateStore } from "@/store"

import { openCreateTemplateDialog } from "./template-create-dialog"

/**
 * 新建模板的完整流程:弹框取标题 → 落库 → 打开 tab。
 *
 * 用户取消或创建失败时返回 null,不改变任何状态。
 * 提示信息通过 window.alert 兜底(项目当前无全局 toast,与 close-coordinator 保持一致)。
 */
export async function createTemplateWithDialog(): Promise<number | null> {
  const title = await openCreateTemplateDialog()
  if (!title) return null
  const store = useTemplateStore.getState()
  const created = await store.create(title, "")
  if (!created) {
    window.alert(`创建模板 "${title}" 失败`)
    return null
  }
  useTabStore.getState().openTemplateTab(created.id, created.title)
  return created.id
}