import { Link } from "react-router-dom"

import { usePromptStore } from "@/store"
import { promptDetailPath } from "@/router/paths"

export default function PromptsPage() {
  const prompts = usePromptStore((state) => state.prompts)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Prompts</h1>
      {prompts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No prompts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {prompts.map((prompt) => (
            <li key={prompt.id}>
              <Link
                to={promptDetailPath(prompt.id)}
                className="block rounded-md border p-3 text-sm hover:bg-muted"
              >
                {prompt.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}