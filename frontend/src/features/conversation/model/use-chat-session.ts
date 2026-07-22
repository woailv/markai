import { useCallback, useEffect, useState } from "react"

import { Events } from "@wailsio/runtime"

import { ConversationService } from "@/../bindings/prompttool/internal/services/conversation"
import type {
  MessageDTO,
  MessageFragmentDTO,
} from "@/../bindings/prompttool/internal/services/conversation/models"

import { encodeTemplateToken } from "@/shared/rich-editor"
import { useTemplateStore } from "@/entities/template"
import type { ChatMessage } from "@/entities/message"

import { useConversationStore } from "./conversation.store"

const FRAGMENT_UPDATED_EVENT = "conversation:fragment-updated"

interface Options {
  conversationId: number | null
  onConversationCreated?: (convId: number) => void
  onConversationsChanged?: () => void
}

/**
 * useChatSession 承载单个 chat tab 的会话数据与操作。
 *
 * 数据模型:AI 消息含 fragments[] 结构化片段(后端下发)。
 * 事件模型:后端在片段状态变化时 emit conversation:fragment-updated,
 * 本 hook 合并到对应消息里,前端只做渲染,不解析 AI 原文。
 */
export function useChatSession({
  conversationId,
  onConversationCreated,
  onConversationsChanged,
}: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
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
          (detail.messages || []).map((m) => normalizeMessage(m)),
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

  // 订阅后端 fragment 状态更新:只处理归属于当前会话的更新。
  useEffect(() => {
    const unsub = Events.On(FRAGMENT_UPDATED_EVENT, (evt) => {
      const payload = Array.isArray(evt.data) ? evt.data[0] : evt.data
      if (!payload) return
      const p = payload as {
        conversationId?: number
        fragment?: MessageFragmentDTO
      }
      if (!p.fragment) return
      if (currentConvId == null || p.conversationId !== currentConvId) return
      setMessages((prev) => mergeFragment(prev, p.fragment!))
    })
    return () => {
      if (typeof unsub === "function") unsub()
    }
  }, [currentConvId])

  const sendMessage = useCallback(
    async (content: string) => {
      const looksLikeAssistant = /<(?:WRITE_FILE|EDIT_FILE|DELETE_FILE|MOVE_PATH|CREATE_DIRECTORY|REQUEST_DIRECTORY_LIST|REQUEST_FILE)[\s/>]/.test(
        content,
      )
      const tokens = templates
        .filter((t) => selectedTemplateIds.has(t.id))
        .map((tpl) => encodeTemplateToken(tpl.id, tpl.title))
      let payload = content
      if (!looksLikeAssistant && tokens.length > 0) {
        payload = `${tokens.join(" ")}\n\n${content}`
      }

      const tempId = `temp-${Date.now()}`
      // 后端不再返回 content,前端也统一按 fragments 渲染:
      // 本地为 optimistic 消息合成一条 TEXT 片段承载原文,后端回包后整体替换。
      const tempFragment: MessageFragmentDTO = {
        id: -1,
        messageId: -1,
        orderIndex: 0,
        kind: "TEXT",
        path: "",
        destination: "",
        rawStart: 0,
        rawEnd: payload.length,
        blockIndex: 0,
        before: payload,
        after: "",
        status: "text",
        matchReason: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          role: looksLikeAssistant ? "assistant" : "user",
          createdAt: new Date().toISOString(),
          fragments: [tempFragment],
        },
      ])

      try {
        const res = await ConversationService.AppendMessage({
          conversationId: currentConvId || 0,
          role: "",
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
          prev.map((m) => (m.id === tempId ? normalizeMessage(res.message) : m)),
        )
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
      if (!updated) return
      // 后端 UpdateMessage 不重新解析 fragments,而消息内容已被替换,
      // 因此本地无法基于 fragments 反映最新编辑结果。为保证展示与
      // 数据库一致,这里改为整会话重载(fragments 与 message 一起拉回)。
      if (currentConvId != null) {
        await loadConversation(currentConvId)
      }
    },
    [currentConvId, loadConversation],
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

/** 后端 DTO → 前端 ChatMessage,处理 role 收窄与 fragments 默认空数组。 */
function normalizeMessage(m: MessageDTO): ChatMessage {
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    createdAt: m.createdAt,
    fragments: m.fragments ?? [],
  }
}

/** 把单个 fragment 更新合并到对应 message 里,若不属于任何本地消息则丢弃。 */
function mergeFragment(
  messages: ChatMessage[],
  frag: MessageFragmentDTO,
): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== frag.messageId) return m
    const list = m.fragments ?? []
    const idx = list.findIndex((f) => f.id === frag.id)
    if (idx === -1) return { ...m, fragments: [...list, frag] }
    const next = list.slice()
    next[idx] = frag
    return { ...m, fragments: next }
  })
}
