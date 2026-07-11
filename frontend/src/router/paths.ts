export const ROUTE_PATHS = {
  ROOT: "/",
  HOME: "/",
  LOGIN: "/login",
  PROMPTS: "/prompts",
  PROMPT_DETAIL: "/prompts/:id",
  SETTINGS: "/settings",
  NOT_FOUND: "*",
} as const

export const promptDetailPath = (id: string) => `/prompts/${id}`