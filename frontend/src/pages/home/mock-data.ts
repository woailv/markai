import type { ChatMessage, Template } from "./types"

export const MOCK_TEMPLATES: Template[] = [
  {
    id: "tpl-1",
    name: "代码审查助手",
    description: "对代码进行结构、性能、可读性方面的审查。",
    content:
      "你是一位资深工程师。请审查以下代码,指出潜在问题并给出改进建议:\n\n{{code}}",
    tags: ["code", "review"],
    updatedAt: "2025-01-10",
  },
  {
    id: "tpl-2",
    name: "会议纪要总结",
    description: "根据会议内容生成结构化纪要。",
    content:
      "请根据以下会议记录,生成包含主要议题、结论、待办事项的会议纪要:\n\n{{transcript}}",
    tags: ["meeting", "summary"],
    updatedAt: "2025-01-08",
  },
  {
    id: "tpl-3",
    name: "翻译润色",
    description: "中英互译并进行润色。",
    content: "请将以下内容翻译为 {{target_language}},并保持自然流畅:\n\n{{text}}",
    tags: ["translate"],
    updatedAt: "2025-01-05",
  },
]

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "m-1",
    role: "assistant",
    content: "你好!选择左侧模板开始一次对话。",
    createdAt: "2025-01-10 09:00",
  },
]