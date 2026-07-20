/**
 * 指令执行的公共结果模型。
 *
 * 类型从原 executor/command-executor.ts 中提出,让消息渲染(entities/message)
 * 与执行动作(features/executor)可以共用同一份定义,而不用反向依赖 feature。
 */

export type ExecStatus = "success" | "error" | "cancelled" | "skipped"

export interface ExecResultBase {
  kind: string
  status: ExecStatus
  /** 一句话摘要,用于回执主行 */
  summary: string
  /** 详情:失败原因、diff、返回数据等 */
  detail?: string
  /** 主路径,用于等宽字体渲染 */
  path?: string
  durationMs: number
}

export interface ExecutionReport {
  results: ExecResultBase[]
  aborted: boolean
  batchId?: number
}
