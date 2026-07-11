import type { ChatMessage } from "./types"

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "m-1",
    role: "assistant",
    content:
      "你好!我是你的 Prompt 助手。\n\n从左侧选择一个模板开始,或直接输入内容开启新对话。",
    createdAt: new Date().toISOString(),
  },
]