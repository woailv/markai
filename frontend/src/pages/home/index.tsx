import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { buildTemplateEditPath, ROUTE_PATHS } from "@/router/paths"

import { ChatPanel } from "./chat-panel"
import { executeCommands } from "./executor/command-executor"
import {
  COMMAND_TAG_DETECT_RE,
  parseCommands,
} from "./executor/command-parser"
import { ConfirmDialogHost } from "./executor/confirm-dialog"
import {
  encodeExecReport,
  encodeExecStatus,
} from "./executor/execution-report"
import { MOCK_MESSAGES } from "./mock-data"
import type { ChatMessage, Template } from "./types"
import { buildTemplatePreview } from "./utils"

export default function HomePage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(
    new Set(),
  )
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES)

  const loadTemplates = useCallback(async () => {
    const list = (await PromptTemplateService.List()) ?? []
    setTemplates(list)
    // 保留仍存在的已选 id,过滤掉已被删除的
    setSelectedTemplateIds((prev) => {
      const existing = new Set(list.map((t) => t.id))
      const next = new Set<number>()
      prev.forEach((id) => {
        if (existing.has(id)) next.add(id)
      })
      return next.size === prev.size ? prev : next
    })
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const handleSend = (content: string) => {
    const now = new Date().toISOString()

    // 若匹配到指令标签，视为 AI 发送的消息
    const isAssistant = COMMAND_TAG_DETECT_RE.test(content)
    let payload = content

    // 仅在真实用户发送时，才消耗性能组装已选模板上下文
    if (!isAssistant) {
      // 用户正文中的文件标签已由 RichComposer 通过 documentToPlainText 还原为绝对路径。
      const templateBlocks = templates
        .filter((t) => selectedTemplateIds.has(t.id))
        .map((tpl) => {
          const { plain } = buildTemplatePreview(tpl)
          const title = tpl.title?.trim() || "未命名模板"
          return `# ${title}\n${plain}`.trim()
        })
        .filter((s) => s.length > 0)

      if (templateBlocks.length > 0) {
        payload = `${templateBlocks.join("\n\n---\n\n")}\n\n---\n\n${content}`
      }
    }

    const messageId = `${isAssistant ? "a" : "u"}-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        role: isAssistant ? "assistant" : "user",
        content: payload,
        createdAt: now,
      },
    ])

    if (isAssistant) {
      void runCommandPipeline(payload)
    }
    // 注意:发送后保留模板选中状态,便于连续对话复用。
  }

  /**
   * 解析 AI 消息中的指令 → 追加执行中占位 → 顺序执行 → 用结构化回执替换占位。
   * 若消息中未包含可解析指令,不追加任何回执,保持消息本身可见。
   */
  const runCommandPipeline = async (content: string) => {
    const items = parseCommands(content)
    if (items.length === 0) return

    const statusId = `exec-${Date.now()}`
    const now = new Date().toISOString()
    setMessages((prev) => [
      ...prev,
      {
        id: statusId,
        role: "assistant",
        content: encodeExecStatus(items.length),
        createdAt: now,
      },
    ])

    const report = await executeCommands(items)

    setMessages((prev) =>
      prev.map((m) =>
        m.id === statusId
          ? {
              ...m,
              content: encodeExecReport(report),
              createdAt: new Date().toISOString(),
            }
          : m,
      ),
    )
  }

  const handleClear = () => {
    setMessages([])
  }

  const handleToggleTemplate = (id: number) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateTemplate = () => {
    navigate(ROUTE_PATHS.TEMPLATE_NEW)
  }

  const handleEditTemplate = (id: number) => {
    navigate(buildTemplateEditPath(id))
  }

  const handleDeleteTemplate = async (id: number) => {
    await PromptTemplateService.Delete(id)
    await loadTemplates()
  }

  return (
    <div className="flex h-svh overflow-hidden">
      <ChatPanel
        messages={messages}
        onSend={handleSend}
        onClear={handleClear}
        templates={templates}
        selectedTemplateIds={selectedTemplateIds}
        onToggleTemplate={handleToggleTemplate}
        onCreateTemplate={handleCreateTemplate}
        onEditTemplate={handleEditTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
      <ConfirmDialogHost />
    </div>
  )
}