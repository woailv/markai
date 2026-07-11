import { Navigate, useLocation } from "react-router-dom"

import { useAuthStore } from "@/store"

import { ROUTE_PATHS } from "./paths"

interface GuardProps {
  children: React.ReactNode
}

export function RequireAuth({ children }: GuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return (
      <Navigate to={ROUTE_PATHS.LOGIN} state={{ from: location }} replace />
    )
  }

  return <>{children}</>
}

export function RequireGuest({ children }: GuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to={ROUTE_PATHS.HOME} replace />
  }

  return <>{children}</>
}