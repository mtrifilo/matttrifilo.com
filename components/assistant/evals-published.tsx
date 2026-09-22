'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Whether the site has a published eval run, carried from the server pages
 * down to the disclosure under the composer (MTC-44).
 *
 * The disclosure renders inside two different client components, so it can
 * neither read the filesystem itself nor be handed the answer as a prop by
 * both of its callers. The pages that own those surfaces read
 * lib/evals/results at build time and provide it here instead.
 *
 * The default is false, so nothing offers the link unless a page has said
 * there is a run behind it.
 */
const EvalsPublishedContext = createContext(false)

export function EvalsPublishedProvider({
  children,
  published,
}: {
  children: ReactNode
  published: boolean
}) {
  return (
    <EvalsPublishedContext value={published}>{children}</EvalsPublishedContext>
  )
}

export function useEvalsPublished(): boolean {
  return useContext(EvalsPublishedContext)
}
