import { RichEditor } from "@/components/rich-editor"

import {
  decodeExecPayload,
  ExecReportView,
  ExecStatusView,
} from "./executor/execution-report"

interface MessageContentProps {
  content: string
  /** 用户气泡为深色主色底,需要反转配色以保证可读性 */
  inverted?: boolean
}

/**
 * 消息气泡内容渲染(仅用于用户消息与老版兼容)。
 *
 * AI 消息新展示态由 <AssistantMessage/> 单独负责,不再走这里。
 * 保留 __EXEC_STATUS__ / __EXEC_REPORT__ 独立消息的兼容渲染,
 * 用于老会话历史中残留的独立回执消息。
 */
export function MessageContent({
  content,
  inverted = false,
}: MessageContentProps) {
  const execPayload = decodeExecPayload(content)
  if (execPayload?.type === "status" && execPayload.status) {
    return <ExecStatusView pending={execPayload.status.pending} />
  }
  if (execPayload?.type === "report" && execPayload.report) {
    return <ExecReportView report={execPayload.report} />
  }

  return (
    <RichEditor
      value={content}
      mode={inverted ? "readonly-inverted" : "readonly"}
      markdown
      fileTokens={{ enabled: true }}
      templateTokens={{ enabled: true }}
      className={
        // 窄气泡内 markdown 元素样式校准:代码块/引用/列表更紧凑
        "min-w-0 max-w-full " +
        "[&_pre]:my-1.5 [&_pre]:overflow-x-auto " +
        "[&_code]:font-mono [&_code]:text-[0.9em] " +
        "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-current/30 [&_blockquote]:pl-2 [&_blockquote]:opacity-90 " +
        "[&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 " +
        "[&_h1]:mt-1.5 [&_h1]:mb-1 [&_h2]:mt-1.5 [&_h2]:mb-1 [&_h3]:mt-1 [&_h3]:mb-0.5 " +
        "[&_p]:my-0"
      }
    />
  )
}