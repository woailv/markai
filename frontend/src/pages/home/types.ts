export interface Template {
  id: string
  name: string
  description: string
  content: string
  tags: string[]
  updatedAt: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}