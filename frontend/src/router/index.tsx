import { lazy, Suspense } from "react"
import { createBrowserRouter, RouterProvider } from "react-router-dom"

import { RootLayout } from "@/layouts/root-layout"
import { AuthLayout } from "@/layouts/auth-layout"

import { RequireAuth, RequireGuest } from "./guards"
import { ROUTE_PATHS } from "./paths"

const HomePage = lazy(() => import("@/pages/home"))
const LoginPage = lazy(() => import("@/pages/login"))
const PromptsPage = lazy(() => import("@/pages/prompts"))
const PromptDetailPage = lazy(() => import("@/pages/prompts/detail"))
const SettingsPage = lazy(() => import("@/pages/settings"))
const NotFoundPage = lazy(() => import("@/pages/not-found"))

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
    path: ROUTE_PATHS.ROOT,
    element: (
      <RequireAuth>
        <RootLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: withSuspense(<HomePage />) },
      {
        path: ROUTE_PATHS.PROMPTS,
        element: withSuspense(<PromptsPage />),
      },
      {
        path: ROUTE_PATHS.PROMPT_DETAIL,
        element: withSuspense(<PromptDetailPage />),
      },
      {
        path: ROUTE_PATHS.SETTINGS,
        element: withSuspense(<SettingsPage />),
      },
    ],
  },
  {
    element: (
      <RequireGuest>
        <AuthLayout />
      </RequireGuest>
    ),
    children: [
      { path: ROUTE_PATHS.LOGIN, element: withSuspense(<LoginPage />) },
    ],
  },
  {
    path: ROUTE_PATHS.NOT_FOUND,
    element: withSuspense(<NotFoundPage />),
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}

export { ROUTE_PATHS, promptDetailPath } from "./paths"