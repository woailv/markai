import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { buildTemplateEditPath, ROUTE_PATHS } from "@/router/paths"

import { ChatPanel } from "./chat-panel"
import { MOCK_MESSAGES } from "./mock-data"
import type { ChatMessage, Template } from "./types"

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
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${prev.length + 1}-${Date.now()}`,
        role: "user",
        content,
        createdAt: now,
      },
    ])
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
    </div>
  )
}