import { lazy, Suspense } from "react"
import { createBrowserRouter, RouterProvider } from "react-router-dom"

export const ROUTE_PATHS = {
  ROOT: "/",
  HOME: "/",
} as const

const HomePage = lazy(() =>
  import("@/pages/home").then((m) => ({ default: m.HomePage })),
)

function PageFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  )
}

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>
}

const router = createBrowserRouter([
  {
    path: ROUTE_PATHS.HOME,
    element: withSuspense(<HomePage />),
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
