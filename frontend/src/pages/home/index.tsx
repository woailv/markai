import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { PromptTemplateService } from "@/../bindings/prompttool/internal/services"
import { buildTemplateEditPath, ROUTE_PATHS } from "@/router/paths"

import { ChatPanel } from "./chat-panel"
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
    // 组装载荷: 已选模板(按列表顺序)作为前置上下文,用户正文在后。
    // 用户正文中的文件标签已由 RichComposer 通过 documentToPlainText 还原为绝对路径。
    const templateBlocks = templates
      .filter((t) => selectedTemplateIds.has(t.id))
      .map((tpl) => {
        const { plain } = buildTemplatePreview(tpl)
        const title = tpl.title?.trim() || "未命名模板"
        return `# ${title}\n${plain}`.trim()
      })
      .filter((s) => s.length > 0)

    const payload =
      templateBlocks.length > 0
        ? `${templateBlocks.join("\n\n---\n\n")}\n\n---\n\n${content}`
        : content

    setMessages((prev) => [
      ...prev,
      {
        id: `u-${prev.length + 1}-${Date.now()}`,
        role: "user",
        content: payload,
        createdAt: now,
      },
    ])
    // 注意:发送后保留模板选中状态,便于连续对话复用。
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