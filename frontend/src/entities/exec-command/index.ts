/**
 * exec-command 屏障重新导出:
 * - 片段类型与助手来自后端 bindings(MessageFragmentDTO);
 * - 只保留少量与批次撤销相关的视图/hook。
 */
export type { MessageFragmentDTO } from "@/../bindings/prompttool/internal/services/conversation/models"
export {
  isApplyableStatus,
  isModifyingKind,
  isReadOnlyKind,
  extractRequestPathsFromFragments,
  extractRequestPathsByKindFromFragments,
} from "./fragment-utils"

export { useBatchStatus } from "./use-batch-status"
