/**
 * features/executor 是命令执行流的对外入口。
 *
 * 执行动作已迁移到后端(见 internal/services/conversation/aiproto/executor.go),
 * 前端不再持有 executor;本 barrel 仅保留状态/视图相关的 re-export,方便页面与
 * widget 从 `@/features/executor` 消费同一命名。
 */
export type { ExecStatus, ExecResultBase, ExecutionReport } from "@/entities/exec-command"
export { useBatchStatus } from "@/entities/exec-command"
