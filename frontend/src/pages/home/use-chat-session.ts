import { useCallback, useEffect, useState } from "react"

import {
  ConversationService,
  PromptTemplateService,
  SnapshotService,
} from "@/../bindings/prompttool/internal/services"

import { encodeTemplateToken } from "@/components/rich-editor"

import { COMMAND_TAG_DETECT_RE, parseCommands } from "./executor/command-parser"
import { executeCommands } from "./executor/command-executor"
import { withExecMeta } from "./executor/exec-meta"
import type { ChatMessage, Template } from "./types"

interface Options {
  /** 已落库会话 id。null 表示新会话,首次发送后会通过 onConversationCreated 回填。 */
  conversationId: number | null
  /** 新建会话成功后回调,用于将 tab 绑定到真实的 conversationId。 */
  onConversationCreated?: (convId: number) => void
  /** 会话列表变更后回调(比如刷新侧边栏)。 */
  onConversationsChanged?: () => void
}

/**
 * useChatSession 从原 HomePage 抽出,承载单个 chat tab 的会话数据与操作。
 * 生命周期与 tab 组件绑定:切换 tab 会导致组件 unmount → 状态自然重置。
 */
export function useChatSession({
  conversationId,
  onConversationCreated,
  onConversationsChanged,
}: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(
    new Set(),
  )
  // 本 hook 内部维护一个"当前会话 id"镜像,新建会话后会更新。
  const [currentConvId, setCurrentConvId] = useState<number | null>(
    conversationId,
  )

  // 当外部 conversationId 变化(理论上不会,tab 用 key 隔离),重置一次
  useEffect(() => {
    setCurrentConvId(conversationId)
  }, [conversationId])

  const loadTemplates = useCallback(async () => {
    const list = (await PromptTemplateService.List()) ?? []
    setTemplates(list)
    setSelectedTemplateIds((prev) => {
      const existing = new Set(list.map((t) => t.id))
      const next = new Set<number>()
      prev.forEach((id) => {
        if (existing.has(id)) next.add(id)
      })
      return next.size === prev.size ? prev : next
    })
  }, [])

  const loadConversation = useCallback(
    async (id: number) => {
      const detail = await ConversationService.Get(id)
      if (detail) {
        setMessages(
          (detail.messages || []).map((m) => ({
            ...m,
            role: m.role as "user" | "assistant",
          })),
        )
        setSelectedTemplateIds(
          new Set(detail.conversation.templateIds || []),
        )
      } else {
        // 会话已被删除
        setMessages([])
        setSelectedTemplateIds(new Set())
        setCurrentConvId(null)
      }
    },
    [],
  )

  // 初次挂载:加载模板 + (若有 convId)加载会话
  useEffect(() => {
    void loadTemplates()
    if (conversationId != null) {
      void loadConversation(conversationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runCommandPipeline = useCallback(
    async (content: string, convId: number, sourceMsgId: number) => {
      const items = parseCommands(content)
      if (items.length === 0) return

      const batchRes = await SnapshotService.BeginBatch({
        conversationId: convId,
        messageId: sourceMsgId,
      })
      const batchId = batchRes?.batchId || 0

      const pendingContent = withExecMeta(content, {
        status: "pending",
        pending: items.length,
      })
      await ConversationService.UpdateMessage({
        messageId: sourceMsgId,
        content: pendingContent,
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === sourceMsgId ? { ...m, content: pendingContent } : m,
        ),
      )

      const report = await executeCommands(items, batchId)
      report.batchId = batchId

      const finalContent = withExecMeta(content, {
        status: "done",
        report,
      })
      await ConversationService.UpdateMessage({
        messageId: sourceMsgId,
        content: finalContent,
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === sourceMsgId ? { ...m, content: finalContent } : m,
        ),
      )
    },
    [],
  )

  const sendMessage = useCallback(
    async (content: string) => {
      const isAssistant = COMMAND_TAG_DETECT_RE.test(content)
      let payload = content

      if (!isAssistant) {
        const tokens = templates
          .filter((t) => selectedTemplateIds.has(t.id))
          .map((tpl) => encodeTemplateToken(tpl.id, tpl.title))
        if (tokens.length > 0) {
          payload = `${tokens.join(" ")}\n\n${content}`
        }
      }

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
          conversationId: currentConvId || 0,
          role: isAssistant ? "assistant" : "user",
          content: payload,
          batchId: 0,
        })
        if (!res) return

        if (res.createdNew) {
          setCurrentConvId(res.conversationId)
          onConversationCreated?.(res.conversationId)
          if (selectedTemplateIds.size > 0) {
            await ConversationService.SetTemplates({
              conversationId: res.conversationId,
              templateIds: Array.from(selectedTemplateIds),
            })
          }
        }
        onConversationsChanged?.()

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
      } catch (err) {
        console.error("Failed to append message", err)
      }
    },
    [
      currentConvId,
      onConversationCreated,
      onConversationsChanged,
      runCommandPipeline,
      selectedTemplateIds,
      templates,
    ],
  )

  const clearMessages = useCallback(async () => {
    if (currentConvId != null) {
      await ConversationService.ClearMessages(currentConvId)
      onConversationsChanged?.()
    }
    setMessages([])
  }, [currentConvId, onConversationsChanged])

  const deleteMessage = useCallback(
    async (msgId: number) => {
      await ConversationService.DeleteMessage(msgId)
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      onConversationsChanged?.()
    },
    [onConversationsChanged],
  )

  const editMessage = useCallback(
    async (msgId: number, newContent: string) => {
      const updated = await ConversationService.UpdateMessage({
        messageId: msgId,
        content: newContent,
      })
      if (updated) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, content: newContent } : m,
          ),
        )
      }
    },
    [],
  )

  const toggleTemplate = useCallback(
    (id: number) => {
      setSelectedTemplateIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        const ids = Array.from(next)
        if (currentConvId != null) {
          void ConversationService.SetTemplates({
            conversationId: currentConvId,
            templateIds: ids,
          }).catch((err) =>
            console.error("[chat-session] SetTemplates failed", err),
          )
        }
        return next
      })
    },
    [currentConvId],
  )

  const refreshTemplates = loadTemplates

  return {
    messages,
    templates,
    selectedTemplateIds,
    currentConvId,
    sendMessage,
    clearMessages,
    deleteMessage,
    editMessage,
    toggleTemplate,
    refreshTemplates,
  }
}