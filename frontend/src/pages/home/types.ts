export type { PromptTemplate as Template } from "@/../bindings/prompttool/internal/services/models"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}