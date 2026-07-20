/**
 * features/executor 是命令执行流的对外入口。
 *
 * 具体实现(parser / executor / codec / 视图 / batch status hook)已下沉到
 * entities/exec-command,以便消息实体、汇报视图等多处安全复用而不引入
 * 反向依赖。本 feature 的 barrel 只做 re-export,保留 AGENTS.md 中枚举的
 * feature 位置,方便页面与 widget 从 `@/features/executor` 消费。
 */
export type { ExecStatus, ExecResultBase, ExecutionReport } from "@/entities/exec-command"
export { executeCommands, useBatchStatus } from "@/entities/exec-command"
