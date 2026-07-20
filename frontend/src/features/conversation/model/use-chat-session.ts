import { useCallback, useEffect, useState } from "react"

import {
  ConversationService,
  SnapshotService,
} from "@/../bindings/prompttool/internal/services"

import { encodeTemplateToken } from "@/shared/rich-editor"
import { useTemplateStore } from "@/entities/template"
import {
  COMMAND_TAG_DETECT_RE,
  parseCommands,
  executeCommands,
  withExecMeta,
} from "@/entities/exec-command"
import type { ChatMessage } from "@/entities/message"

import { useConversationStore } from "./conversation.store"

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
  // 模板列表统一走 useTemplateStore,避免本 hook 维护一份副本。
  // 之前的实现会在"新建模板"后因本地副本未刷新而导致 composer 模板选择框看不到新模板。
  const templates = useTemplateStore((s) => s.templates)
  const loadTemplatesFromStore = useTemplateStore((s) => s.load)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(
    new Set(),
  )
  // 本 hook 内部维护一个"当前会话 id"镜像,新建会话后会更新。
  const [currentConvId, setCurrentConvId] = useState<number | null>(
    conversationId,
  )

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

  // 外部 conversationId 变化时(顶栏 Popover 切换会话 / 点击"新建会话"),
  // 同步内部镜像并加载对应会话的消息;为 null 时重置为空会话。
  useEffect(() => {
    setCurrentConvId(conversationId)
    if (conversationId == null) {
      setMessages([])
      setSelectedTemplateIds(new Set())
    } else {
      void loadConversation(conversationId)
    }
  }, [conversationId, loadConversation])

  // 模板列表变化时,剔除 selectedTemplateIds 中已被删除的项。
  useEffect(() => {
    setSelectedTemplateIds((prev) => {
      if (prev.size === 0) return prev
      const existing = new Set(templates.map((t) => t.id))
      const next = new Set<number>()
      prev.forEach((id) => {
        if (existing.has(id)) next.add(id)
      })
      return next.size === prev.size ? prev : next
    })
  }, [templates])

  // 初次挂载:确保模板 store 已加载。会话加载由上面的 conversationId 副作用统一处理。
  useEffect(() => {
    void loadTemplatesFromStore()
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
          if (selectedTemplateIds.size > 0) {
            await ConversationService.SetTemplates({
              conversationId: res.conversationId,
              templateIds: Array.from(selectedTemplateIds),
            })
          }
          // 必须先 await 刷新会话列表,再把新 id 设为激活会话。
          // 否则 HomePage 的"校正副作用"会因列表尚未包含新会话而把
          // activeConversationId 立刻重置为 null,导致下次发送又新建一条会话。
          await useConversationStore.getState().load()
          useConversationStore
            .getState()
            .setActiveConversationId(res.conversationId)
          onConversationCreated?.(res.conversationId)
        } else {
          // 已有会话:列表变化(标题/排序)异步刷新即可
          void useConversationStore.getState().load()
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
      void useConversationStore.getState().load()
      onConversationsChanged?.()
    }
    setMessages([])
  }, [currentConvId, onConversationsChanged])

  const deleteMessage = useCallback(
    async (msgId: number) => {
      await ConversationService.DeleteMessage(msgId)
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      void useConversationStore.getState().load()
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

  const refreshTemplates = useCallback(async () => {
    // 兼容原有 API;实际数据源为 store,直接触发 store.load。
    await useTemplateStore.getState().load()
  }, [])

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