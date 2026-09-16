import type { MetadataRoute } from 'next'

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]['changeFrequency']
>

export interface SiteRoute {
  href: string
  label: string
  changeFrequency: ChangeFrequency
  priority: number
  /** Matt's Career Assistant; dropped everywhere when the kill switch is on. */
  assistant?: true
  /** Keep the page in the sitemap but out of the header nav. */
  hideFromNav?: boolean
}

/**
 * Single source of truth for the site's static pages. The nav and the
 * sitemap both read from here so a new page cannot be added to one and
 * forgotten in the other (that is how /books went missing from the
 * sitemap), and lib/site-routes.test.ts checks the list against the
 * page.tsx files on disk. Blog posts are added to the sitemap separately
 * from the filesystem.
 */
export const siteRoutes: readonly SiteRoute[] = [
  { href: '/', label: 'Home', changeFrequency: 'monthly', priority: 1 },
  { href: '/blog', label: 'Blog', changeFrequency: 'weekly', priority: 0.8 },
  {
    // Matt's Career Assistant. Labelled "Ask" rather than "Assistant" or
    // "Chat" because the nav reads as a list of what a visitor can do, and
    // asking is the thing this page is for.
    href: '/ask',
    label: 'Ask',
    changeFrequency: 'monthly',
    priority: 0.7,
    assistant: true,
  },
  {
    href: '/open-source',
    label: 'Open Source',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    href: '/books',
    label: 'Recommended Books',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    href: '/resume',
    label: 'Résumé',
    changeFrequency: 'yearly',
    priority: 0.5,
  },
  {
    href: '/contact',
    label: 'Contact',
    changeFrequency: 'yearly',
    priority: 0.5,
  },
  {
    // The career assistant's published corpus. In the sitemap so the
    // documents are indexable and the assistant's answers are checkable,
    // and out of the nav because it is reached through an answer's source
    // chips rather than browsed: /ask is the nav entry for the assistant.
    href: '/knowledge',
    label: 'Knowledge',
    changeFrequency: 'weekly',
    priority: 0.4,
    hideFromNav: true,
    assistant: true,
  },
]

/**
 * The routes the site offers right now. With the assistant killed
 * (`CHAT_DISABLED=1`, see lib/chat/kill-switch.ts) its page is not served, so
 * neither the nav nor the sitemap may point at it.
 */
export function visibleSiteRoutes(options: {
  assistantDisabled: boolean
}): readonly SiteRoute[] {
  return options.assistantDisabled
    ? siteRoutes.filter(route => !route.assistant)
    : siteRoutes
}
