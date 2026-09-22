'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Whether the site has a published eval run, carried from the server pages
 * down to the disclosure under the composer (MTC-44).
 *
 * The disclosure renders inside two different client components, neither of
 * which takes props from the page that renders it, so it can neither read
 * the filesystem itself nor be handed the answer down the tree. The pages
 * that own those surfaces read lib/evals/results while they prerender and
 * provide it here instead.
 *
 * The default is false, so a surface that renders the disclosure without
 * providing this offers no link rather than a broken one. A third surface
 * therefore has to wrap itself in this provider to get the link at all.
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
