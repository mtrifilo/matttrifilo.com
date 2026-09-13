import type { MetadataRoute } from 'next'

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]['changeFrequency']
>

export interface SiteRoute {
  href: string
  label: string
  changeFrequency: ChangeFrequency
  priority: number
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
]
