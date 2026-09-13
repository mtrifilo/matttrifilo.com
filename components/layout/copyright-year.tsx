'use client'

import { useSyncExternalStore } from 'react'

const BUILD_YEAR = new Date().getFullYear()

const subscribe = () => () => {}
const getClientYear = () => new Date().getFullYear()
const getServerYear = () => BUILD_YEAR

/**
 * Every route is statically prerendered, so a server-rendered year is
 * frozen at build time. useSyncExternalStore hydrates with the build
 * year (matching the static HTML) and then renders the client's year,
 * without an effect or a hydration warning.
 */
export function CopyrightYear() {
  const year = useSyncExternalStore(subscribe, getClientYear, getServerYear)
  return <>{year}</>
}
