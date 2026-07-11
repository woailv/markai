import { useParams } from "react-router-dom"

import { usePromptStore } from "@/store"

export default function PromptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const prompt = usePromptStore((state) =>
    state.prompts.find((item) => item.id === id)
  )

  if (!prompt) {
    return (
      <div className="text-sm text-muted-foreground">Prompt not found.</div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">{prompt.title}</h1>
      <pre className="rounded-md border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
        {prompt.content}
      </pre>
    </div>
  )
}