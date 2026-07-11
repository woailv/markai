import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { ROUTE_PATHS } from "@/router/paths"

export default function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-sm text-muted-foreground">Page not found.</p>
      <Button variant="outline" render={<Link to={ROUTE_PATHS.HOME} />}>
        Go home
      </Button>
    </div>
  )
}