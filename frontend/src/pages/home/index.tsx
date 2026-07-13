import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  ConversationService,
  PromptTemplateService,
  SnapshotService,
} from "@/../bindings/prompttool/internal/services"
import type { ConversationSummary } from "@/../bindings/prompttool/internal/services/models"
import { buildTemplateEditPath, ROUTE_PATHS } from "@/router/paths"

import { ChatPanel } from "./chat-panel"
import { executeCommands } from "./executor/command-executor"
import {
  COMMAND_TAG_DETECT_RE,
  parseCommands,
} from "./executor/command-parser"
import { ConfirmDialogHost, confirmDestructive } from "./executor/confirm-dialog"
import { HistorySidebar } from "./history-sidebar"
import {
  encodeExecReport,
  encodeExecStatus,
} from "./executor/execution-report"
import type { ChatMessage, Template } from "./types"
import { buildTemplatePreview } from "./utils"

export default function HomePage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(
    new Set(),
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

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

  const loadConversations = useCallback(async () => {
    const list = await ConversationService.List()
    setConversations(list || [])
  }, [])

  useEffect(() => {
    void loadTemplates()
    void loadConversations()
  }, [loadTemplates, loadConversations])

  const handleSelectConversation = async (id: number) => {
    const detail = await ConversationService.Get(id)
    if (detail) {
      setMessages(
        (detail.messages || []).map((m) => ({
          ...m,
          role: m.role as "user" | "assistant",
        })),
      )
      setActiveConvId(id)
    }
  }

  const handleNewConversation = () => {
    setActiveConvId(null)
    setMessages([])
  }

  const handleDeleteConversation = async (
    id: number,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation()
    const ok = await confirmDestructive({
      title: "删除会话",
      description: "将删除该会话及所有消息记录，确定继续？",
      destructiveLabel: "删除",
    })
    if (ok) {
      await ConversationService.Delete(id)
      await loadConversations()
      if (activeConvId === id) handleNewConversation()
    }
  }

  const handleDeleteMessage = async (msgId: number) => {
    const ok = await confirmDestructive({
      title: "删除消息",
      description: "将删除此消息，确定继续？",
      destructiveLabel: "删除",
    })
    if (ok) {
      await ConversationService.DeleteMessage(msgId)
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      loadConversations()
    }
  }

  const handleEditMessage = async (msgId: number, newContent: string) => {
    const updated = await ConversationService.UpdateMessage({
      messageId: msgId,
      content: newContent,
    })
    if (updated) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, content: newContent } : m)),
      )
    }
  }

  const handleSend = async (content: string) => {
    const isAssistant = COMMAND_TAG_DETECT_RE.test(content)
    let payload = content

    if (!isAssistant) {
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

    // 乐观更新 UI
    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: isAssistant ? "assistant" : "user",
        content: payload,
        createdAt: new Date().toISOString(),
      },
    ])

    try {
      const res = await ConversationService.AppendMessage({
        conversationId: activeConvId || 0,
        role: isAssistant ? "assistant" : "user",
        content: payload,
        batchId: 0,
      })

      if (res) {
        if (res.createdNew) {
          setActiveConvId(res.conversationId)
          await loadConversations()
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...res.message,
                  role: res.message.role as "user" | "assistant",
                }
              : m,
          ),
        )

        if (isAssistant) {
          void runCommandPipeline(payload, res.conversationId, res.message.id)
        }
      }
    } catch (err) {
      console.error("Failed to append message", err)
    }
  }

  const runCommandPipeline = async (
    content: string,
    convId: number,
    sourceMsgId: number,
  ) => {
    const items = parseCommands(content)
    if (items.length === 0) return

    // 1. 开始批次
    const batchRes = await SnapshotService.BeginBatch({
      conversationId: convId,
      messageId: sourceMsgId,
    })
    const batchId = batchRes?.batchId || 0

    // 2. 追加占位消息
    const statusMsgRes = await ConversationService.AppendMessage({
      conversationId: convId,
      role: "assistant",
      content: encodeExecStatus(items.length),
      batchId: batchId,
    })

    const statusMsg = statusMsgRes?.message
    if (statusMsg) {
      setMessages((prev) => [
        ...prev,
        { ...statusMsg, role: "assistant" },
      ])
    }

    // 3. 执行
    const report = await executeCommands(items, batchId)
    report.batchId = batchId

    // 4. 更新占位消息内容
    if (statusMsg) {
      const finalContent = encodeExecReport(report)
      await ConversationService.UpdateMessage({
        messageId: statusMsg.id,
        content: finalContent,
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === statusMsg.id ? { ...m, content: finalContent } : m,
        ),
      )
    }
  }

  const handleClear = async () => {
    if (activeConvId) {
      await ConversationService.Delete(activeConvId)
      await loadConversations()
      handleNewConversation()
    } else {
      setMessages([])
    }
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
      {sidebarOpen && (
        <HistorySidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />
      )}
      <ChatPanel
        messages={messages}
        onSend={handleSend}
        onClear={handleClear}
        onOpenHistory={() => setSidebarOpen((v) => !v)}
        onDeleteMessage={handleDeleteMessage}
        onEditMessage={handleEditMessage}
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