export interface User {
  id: string
  name: string
  email: string
  avatar?: string
}

export interface Prompt {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}