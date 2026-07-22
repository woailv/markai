/**
 * features/executor barrel — 命令执行流已迁移至后端 (aiproto + FragmentService)。
 * 前端只保留批次撤销 hook 供 UI 使用。
 */
export { useBatchStatus } from "@/entities/exec-command"
