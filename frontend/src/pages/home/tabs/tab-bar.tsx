import { useTabStore } from "@/store"

import { TabItem } from "./tab-item"

/**
 * TabBar 是中央区顶部的水平标签栏。
 * v1 只做基础功能:显示 tab 列表、激活、关闭、新建 chat tab。
 * 溢出、拖拽重排、右键菜单、快捷键等留到后续 PR。
 */
export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activateTab = useTabStore((s) => s.activateTab)
  const closeTab = useTabStore((s) => s.closeTab)

  // 固定 tab 排前,其余保持原顺序(稳定排序)
  const ordered = [...tabs]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const pa = a.t.pinned ? 0 : 1
      const pb = b.t.pinned ? 0 : 1
      if (pa !== pb) return pa - pb
      return a.i - b.i
    })
    .map((x) => x.t)

  return (
    <div className="flex h-9 shrink-0 items-center border-b bg-muted/30">
      <div
        role="tablist"
        className="flex h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {ordered.map((t) => (
          <TabItem
            key={t.id}
            tab={t}
            active={t.id === activeTabId}
            onActivate={activateTab}
            onClose={closeTab}
          />
        ))}
      </div>
    </div>
  )
}