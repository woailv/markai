import { useAuthStore } from "@/store"

export default function HomePage() {
  const user = useAuthStore((state) => state.user)

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">
        Welcome{user ? `, ${user.name}` : ""}
      </h1>
      <p className="text-sm text-muted-foreground">
        This is your PromptTool dashboard.
      </p>
    </div>
  )
}