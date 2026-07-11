import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/store"
import { ROUTE_PATHS } from "@/router/paths"

interface LocationState {
  from?: { pathname: string }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((state) => state.login)
  const [name, setName] = useState("")

  const from =
    (location.state as LocationState | null)?.from?.pathname ??
    ROUTE_PATHS.HOME

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      return
    }
    login(
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        email: `${name.trim().toLowerCase()}@example.com`,
      },
      "mock-token"
    )
    navigate(from, { replace: true })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Enter a name to continue.
        </p>
      </div>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <Button type="submit" disabled={!name.trim()}>
        Continue
      </Button>
    </form>
  )
}