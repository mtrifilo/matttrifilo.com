import type { MetadataRoute } from 'next'
import { ASSISTANT_EVALS_TITLE } from '@/components/assistant/copy'

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
  /**
   * The page is served whatever happens, but it is only worth offering to a
   * search engine once there is a published eval run on it.
   */
  needsPublishedEvalRun?: true
  /**
   * `YYYY-MM-DD`, the day the page's own content last changed: the merge
   * date on main of the last change to its page file or the content it
   * renders (tests and head-only metadata do not count). It is the
   * sitemap's lastmod, so it is a fact about the page rather than the
   * build time; move it forward with any change a visitor would see.
   */
  contentUpdated: string
  /**
   * The page lists the blog posts or the published eval runs, so adding
   * one changes the page too and its lastmod is the later of the two.
   */
  lists?: 'posts' | 'evalRuns'
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
  {
    href: '/',
    label: 'Home',
    changeFrequency: 'monthly',
    priority: 1,
    contentUpdated: '2026-09-22',
    lists: 'posts',
  },
  {
    href: '/blog',
    label: 'Blog',
    changeFrequency: 'weekly',
    priority: 0.8,
    contentUpdated: '2026-09-13',
    lists: 'posts',
  },
  {
    // Matt's Career Assistant. Labelled "Ask" rather than "Assistant" or
    // "Chat" because the nav reads as a list of what a visitor can do, and
    // asking is the thing this page is for.
    href: '/ask',
    label: 'Ask',
    changeFrequency: 'monthly',
    priority: 0.7,
    assistant: true,
    contentUpdated: '2026-10-01',
  },
  {
    // The assistant's published eval results (MTC-44). Out of the nav
    // because it is reached from the line under the chat pane, by someone
    // who is already looking at the assistant and wants to know what backs
    // it; in the sitemap because it is a page worth finding.
    href: '/ask/evals',
    label: ASSISTANT_EVALS_TITLE,
    changeFrequency: 'monthly',
    priority: 0.4,
    assistant: true,
    hideFromNav: true,
    needsPublishedEvalRun: true,
    contentUpdated: '2026-09-22',
    lists: 'evalRuns',
  },
  {
    href: '/open-source',
    label: 'Open Source',
    changeFrequency: 'monthly',
    priority: 0.6,
    contentUpdated: '2026-09-22',
  },
  {
    href: '/books',
    label: 'Recommended Books',
    changeFrequency: 'monthly',
    priority: 0.6,
    contentUpdated: '2026-02-28',
  },
  {
    href: '/resume',
    label: 'Résumé',
    changeFrequency: 'yearly',
    priority: 0.5,
    contentUpdated: '2026-09-29',
  },
  {
    href: '/contact',
    label: 'Contact',
    changeFrequency: 'yearly',
    priority: 0.5,
    contentUpdated: '2026-09-13',
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

/**
 * The routes worth submitting to a search engine. Narrower than the served
 * site: the eval results page is real in both states, but until a run is
 * published its whole body is a sentence saying there is none, and the line
 * under the chat pane withholds its link for the same reason.
 */
export function sitemapRoutes(options: {
  assistantDisabled: boolean
  evalResultsPublished: boolean
}): readonly SiteRoute[] {
  return visibleSiteRoutes(options).filter(
    route => options.evalResultsPublished || !route.needsPublishedEvalRun
  )
}

/**
 * A static page's sitemap lastmod: its own content date, or the newest
 * post or eval run it lists when that is later. Dates are `YYYY-MM-DD`,
 * so the later one is the larger string.
 */
export function routeLastModified(
  route: Pick<SiteRoute, 'contentUpdated' | 'lists'>,
  newest: { post?: string; evalRun?: string }
): string {
  const listed =
    route.lists === 'posts'
      ? newest.post
      : route.lists === 'evalRuns'
        ? newest.evalRun
        : undefined
  return listed !== undefined && listed > route.contentUpdated
    ? listed
    : route.contentUpdated
}
