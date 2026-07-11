import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { buildTemplateEditPath, ROUTE_PATHS } from "@/router/paths"

import { ChatPanel } from "./chat-panel"
import { MOCK_MESSAGES } from "./mock-data"
import { TemplateDetail } from "./template-detail"
import { TemplateList } from "./template-list"
import type { ChatMessage, Template } from "./types"

export default function HomePage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES)

  const loadTemplates = useCallback(async () => {
    const list = (await PromptTemplateService.List()) ?? []
    setTemplates(list)
    setSelectedId((prev) => {
      if (prev !== null && list.some((t) => t.id === prev)) return prev
      return list[0]?.id ?? null
    })
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  )

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

  const handleCreate = () => {
    navigate(ROUTE_PATHS.TEMPLATE_NEW)
  }

  const handleEdit = (id: number) => {
    navigate(buildTemplateEditPath(id))
  }

  const handleDelete = async (id: number) => {
    await PromptTemplateService.Delete(id)
    await loadTemplates()
  }

  return (
    <div className="flex h-svh overflow-hidden">
      <TemplateList
        templates={templates}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
      />
      <ChatPanel
        messages={messages}
        onSend={handleSend}
        activeTemplate={selectedTemplate}
      />
      <TemplateDetail
        template={selectedTemplate}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  )
}