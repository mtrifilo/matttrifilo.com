'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getClientYear = () => new Date().getFullYear()

/**
 * Every route is statically prerendered, so the year in the HTML is
 * whatever it was at build time. `prerenderedYear` is computed by the
 * server component that renders this (so it is the same number that is
 * in the static HTML) and used as the hydration snapshot, which keeps
 * hydration clean. After hydration React reads the client's year and
 * re-renders if it differs, so the footer is right on January 1 without
 * a redeploy.
 *
 * This must be a prop: a module-level constant in a 'use client' file is
 * evaluated again in the browser and would just be the client's year.
 */
export function CopyrightYear({
  prerenderedYear,
}: {
  prerenderedYear: number
}) {
  const year = useSyncExternalStore(
    subscribe,
    getClientYear,
    () => prerenderedYear
  )
  return <>{year}</>
}
