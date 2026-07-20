export type { Tab, TabKind, TabStore } from "./model/tab.store"
export { useTabStore } from "./model/tab.store"

export { requestCloseTab, requestCloseTabs } from "./model/close-coordinator"
export { createTemplateWithDialog } from "./model/create-template-flow"
export { useTabShortcuts } from "./model/use-tab-shortcuts"
export { useOpenFileBridge } from "./model/use-open-file-bridge"
export { templateExtensions } from "./model/template-extensions"

export { TabBar } from "./ui/tab-bar"
export { TabContent } from "./ui/tab-content"
export { CloseConfirmDialogHost } from "./ui/close-confirm-dialog"
export { CreateTemplateDialogHost } from "./ui/template-create-dialog"
