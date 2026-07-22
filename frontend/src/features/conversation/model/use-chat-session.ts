import { useCallback, useEffect, useState } from "react"

import { Events } from "@wailsio/runtime"

import { ConversationService } from "@/../bindings/prompttool/internal/services/conversation"
import type { MessageDTO } from "@/../bindings/prompttool/internal/services/conversation/models"

import { encodeTemplateToken } from "@/shared/rich-editor"
import { useTemplateStore } from "@/entities/template"
import type { ChatMessage } from "@/entities/message"

import { useConversationStore } from "./conversation.store"

const MESSAGE_UPDATED_EVENT = "conversation:message-updated"

interface Options {
  /** 已落库会话 id。null 表示新会话,首次发送后会通过 onConversationCreated 回填。 */
  conversationId: number | null
  /** 新建会话成功后回调,用于将 tab 绑定到真实的 conversationId。 */
  onConversationCreated?: (convId: number) => void
  /** 会话列表变更后回调(比如刷新侧边栏)。 */
  onConversationsChanged?: () => void
}

/**
 * useChatSession 承载单个 chat tab 的会话数据与操作。
 *
 * AI 消息(带指令)不再由前端执行:后端识别、解析、执行,并通过
 * `conversation:message-updated` 事件把每一阶段(pending/done)的最新 content
 * 推回来。本 hook 只负责发消息 → 更新本地 messages → 订阅事件合并更新。
 */
export function useChatSession({
  conversationId,
  onConversationCreated,
  onConversationsChanged,
}: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // 模板列表统一走 useTemplateStore,避免本 hook 维护一份副本。
  const templates = useTemplateStore((s) => s.templates)
  const loadTemplatesFromStore = useTemplateStore((s) => s.load)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(
    new Set(),
  )
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
        setMessages([])
        setSelectedTemplateIds(new Set())
        setCurrentConvId(null)
      }
    },
    [],
  )

  useEffect(() => {
    setCurrentConvId(conversationId)
    if (conversationId == null) {
      setMessages([])
      setSelectedTemplateIds(new Set())
    } else {
      void loadConversation(conversationId)
    }
  }, [conversationId, loadConversation])

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

  useEffect(() => {
    void loadTemplatesFromStore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 订阅后端消息更新事件:只处理归属于当前会话的更新。
  useEffect(() => {
    const unsub = Events.On(MESSAGE_UPDATED_EVENT, (evt) => {
      const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
      if (!payload) return
      const p = payload as { conversationId?: number; message?: MessageDTO }
      if (!p.message) return
      if (currentConvId == null || p.conversationId !== currentConvId) return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === p.message!.id
            ? { ...p.message!, role: p.message!.role as "user" | "assistant" }
            : m,
        ),
      )
    })
    return () => {
      if (typeof unsub === "function") unsub()
    }
  }, [currentConvId])

  const sendMessage = useCallback(
    async (content: string) => {
      // role 由后端根据 content 判定;前端 payload 只在 user 消息前补模板 token。
      // 判断"是否为 assistant/命令消息"通过 sentinel/tag 特征都无关紧要,
      // 因为拼模板只对纯用户输入有用 — 命令类内容不会命中模板前缀。
      const tokens = templates
        .filter((t) => selectedTemplateIds.has(t.id))
        .map((tpl) => encodeTemplateToken(tpl.id, tpl.title))
      let payload = content
      // 只在正文不含指令标签特征时拼模板前缀(避免污染 AI 编辑消息)。
      const looksLikeAssistant = /<(?:WRITE_FILE|EDIT_FILE|DELETE_FILE|MOVE_PATH|CREATE_DIRECTORY|REQUEST_DIRECTORY_LIST|REQUEST_FILE)[\s/>]/.test(
        content,
      )
      if (!looksLikeAssistant && tokens.length > 0) {
        payload = `${tokens.join(" ")}\n\n${content}`
      }

      const tempId = `temp-${Date.now()}`
      // 乐观插入:role 用启发式,后端返回后立刻替换。
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          role: looksLikeAssistant ? "assistant" : "user",
          content: payload,
          createdAt: new Date().toISOString(),
        },
      ])

      try {
        const res = await ConversationService.AppendMessage({
          conversationId: currentConvId || 0,
          role: "", // 已弃用;后端自行判定
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
          await useConversationStore.getState().load()
          useConversationStore
            .getState()
            .setActiveConversationId(res.conversationId)
          onConversationCreated?.(res.conversationId)
        } else {
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

        // 执行结果通过 conversation:message-updated 事件推回,本地无需 poll。
      } catch (err) {
        console.error("Failed to append message", err)
      }
    },
    [
      currentConvId,
      onConversationCreated,
      onConversationsChanged,
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
