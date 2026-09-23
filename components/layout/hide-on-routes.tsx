'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Renders its children everywhere except on the named routes.
 *
 * The root layout is the only layout, so a page that must not have a piece of
 * it, /ask, whose transcript fills the viewport and cannot have a footer
 * pushing the composer off it, needs the piece left out from here rather than
 * by a second layout tree. The children stay server components; only the
 * pathname check runs on the client.
 */
export function HideOnRoutes({
  routes,
  children,
}: {
  routes: readonly string[]
  children: ReactNode
}) {
  const pathname = usePathname()
  if (routes.includes(pathname)) return null
  return children
}
