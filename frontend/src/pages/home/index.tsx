import { useMemo, useState } from "react"

import { ChatPanel } from "./chat-panel"
import { MOCK_MESSAGES, MOCK_TEMPLATES } from "./mock-data"
import { TemplateDetail } from "./template-detail"
import { TemplateList } from "./template-list"
import type { ChatMessage } from "./types"

export default function HomePage() {
  const [templates] = useState(MOCK_TEMPLATES)
  const [selectedId, setSelectedId] = useState<string | null>(
    MOCK_TEMPLATES[0]?.id ?? null
  )
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES)

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  )

  const handleSend = (content: string) => {
    const now = new Date().toLocaleString()
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${prev.length + 1}`,
        role: "user",
        content,
        createdAt: now,
      },
    ])
  }

  return (
    <div className="flex h-svh">
      <TemplateList
        templates={templates}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <ChatPanel messages={messages} onSend={handleSend} />
      <TemplateDetail template={selectedTemplate} />
    </div>
  )
}