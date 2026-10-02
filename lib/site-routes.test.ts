import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import sitemap from '@/app/sitemap'
import { getAllBlogPosts, getBlogSlugs, postLastModified } from './blog'
import {
  routeLastModified,
  siteRoutes,
  sitemapRoutes,
  visibleSiteRoutes,
} from './site-routes'
import { isChatDisabled } from './chat/kill-switch'
import { hasPublishedEvalRun, latestEvalSummary } from './evals/results'

const BASE = 'https://matttrifilo.com'
const toUrl = (href: string) => (href === '/' ? BASE : `${BASE}${href}`)

/**
 * Every static route in app/ (a page.tsx with no dynamic segment), using the
 * App Router folder conventions: `[param]` is dynamic (covered by the blog
 * test), `(group)` and `@slot` add no URL segment, `_private` is never a route.
 */
function staticRoutesOnDisk(): string[] {
  const appDir = path.join(process.cwd(), 'app')
  const routes: string[] = []
  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const name = entry.name
        if (name.startsWith('[') || name.startsWith('_')) continue
        const addsSegment = !(name.startsWith('(') || name.startsWith('@'))
        walk(path.join(dir, name), addsSegment ? [...segments, name] : segments)
      } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
        routes.push(segments.length === 0 ? '/' : `/${segments.join('/')}`)
      }
    }
  }
  walk(appDir, [])
  // A parallel-route slot can contribute a page at the same URL as its
  // parent; the route exists once, so report it once.
  return [...new Set(routes)].sort()
}

describe('siteRoutes', () => {
  test('lists exactly the static pages that exist in app/', () => {
    // Fails when a page.tsx is added without a siteRoutes entry (the way
    // /books went missing from the sitemap), or when a route is listed
    // that has no page. siteRoutes also drives the nav; a page that should
    // exist but stay out of the nav sets `hideFromNav` rather than being
    // left out of this list.
    const listed = siteRoutes.map(r => r.href).sort()
    expect(listed).toEqual(staticRoutesOnDisk())
  })
})

describe('sitemap', () => {
  test('includes every static route worth offering', () => {
    const urls = new Set(sitemap().map(entry => entry.url))
    // The environment decides whether the assistant's pages exist, and the
    // published records decide whether the eval results page has anything
    // on it, so the expectation reads the same two things the sitemap does
    // (a `vercel env pull` puts production's CHAT_DISABLED=1 into
    // .env.local).
    const expected = sitemapRoutes({
      assistantDisabled: isChatDisabled(),
      evalResultsPublished: hasPublishedEvalRun(),
    })
    for (const route of expected) expect(urls.has(toUrl(route.href))).toBe(true)
    for (const route of siteRoutes)
      if (!expected.includes(route))
        expect(urls.has(toUrl(route.href))).toBe(false)
  })

  test('includes every blog post on disk', () => {
    const slugs = getBlogSlugs()
    expect(slugs.length).toBeGreaterThan(0)
    const urls = new Set(sitemap().map(entry => entry.url))
    for (const slug of slugs)
      expect(urls.has(`${BASE}/blog/${slug}`)).toBe(true)
  })

  test('offers no corpus document, because nothing serves one', () => {
    // Nothing renders a knowledge document any more, so a sitemap entry
    // for one would advertise a 404. What the assistant read is disclosed
    // in the answer instead.
    for (const entry of sitemap()) {
      expect(entry.url).not.toContain('/knowledge')
    }
  })
})

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar day, not a pattern match like 2026-02-30. */
function isRealDay(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

describe('sitemap lastmod', () => {
  const entries = sitemap()
  const byUrl = new Map(entries.map(entry => [entry.url, entry.lastModified]))

  test('every entry has a calendar day, never the build time', () => {
    for (const { url, lastModified } of entries) {
      expect(typeof lastModified, url).toBe('string')
      expect(lastModified as string, url).toMatch(ISO_DAY)
      expect(isRealDay(lastModified as string), url).toBe(true)
    }
  })

  test('each post is dated by its updated date, else its publish date', () => {
    const posts = getAllBlogPosts()
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts)
      expect(byUrl.get(`${BASE}/blog/${post.slug}`)).toBe(
        postLastModified(post)
      )
  })

  test('each static page is dated by its own content, or what it lists', () => {
    const newest = {
      post: getAllBlogPosts().map(postLastModified).sort().at(-1),
      evalRun: latestEvalSummary()?.ranAt.slice(0, 10),
    }
    const listed = sitemapRoutes({
      assistantDisabled: isChatDisabled(),
      evalResultsPublished: hasPublishedEvalRun(),
    })
    for (const route of listed)
      expect(byUrl.get(toUrl(route.href)), route.href).toBe(
        routeLastModified(route, newest)
      )
  })

  test('the entries do not all share one date, as a build time would', () => {
    // Two pages whose content changed on the same day share a lastmod, so
    // the check is that the dates are per page, not that each is unique.
    expect(new Set(byUrl.values()).size).toBeGreaterThan(1)
  })
})

describe('contentUpdated', () => {
  test('every route has a real day that is not in the future', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const route of siteRoutes) {
      expect(route.contentUpdated, route.href).toMatch(ISO_DAY)
      expect(isRealDay(route.contentUpdated), route.href).toBe(true)
      expect(route.contentUpdated <= today, route.href).toBe(true)
    }
  })
})

describe('routeLastModified', () => {
  const page = { contentUpdated: '2026-09-13' }

  test('is the content date for a page that lists nothing', () => {
    expect(
      routeLastModified(page, { post: '2026-12-01', evalRun: '2026-12-01' })
    ).toBe('2026-09-13')
  })

  test('is the newest listed item when that is later', () => {
    expect(
      routeLastModified(
        { ...page, lists: 'posts' },
        { post: '2026-10-02', evalRun: '2026-12-01' }
      )
    ).toBe('2026-10-02')
    expect(
      routeLastModified(
        { ...page, lists: 'evalRuns' },
        { evalRun: '2026-10-02' }
      )
    ).toBe('2026-10-02')
  })

  test('is the content date when it is later, or nothing is listed yet', () => {
    expect(
      routeLastModified({ ...page, lists: 'posts' }, { post: '2026-03-01' })
    ).toBe('2026-09-13')
    expect(routeLastModified({ ...page, lists: 'evalRuns' }, {})).toBe(
      '2026-09-13'
    )
  })
})

describe('visibleSiteRoutes', () => {
  test('drops the assistant routes, and only those, when the kill switch is on', () => {
    const visible = visibleSiteRoutes({ assistantDisabled: true })
    const assistantRoutes = siteRoutes.filter(route => route.assistant)
    expect(assistantRoutes.length).toBeGreaterThan(0)
    for (const route of assistantRoutes)
      expect(visible.some(served => served.href === route.href)).toBe(false)
    expect(visible.length).toBe(siteRoutes.length - assistantRoutes.length)
    expect(visible.every(route => !route.assistant)).toBe(true)
  })

  test('offers every route when the assistant is serving', () => {
    expect(visibleSiteRoutes({ assistantDisabled: false })).toBe(siteRoutes)
  })

  test('keeps the eval results page out of the sitemap until a run is published', () => {
    // The page is served in both states. Offering a search engine a page
    // whose whole body says there is nothing on it is the thing the line
    // under the chat pane already refuses to do.
    const withRun = sitemapRoutes({
      assistantDisabled: false,
      evalResultsPublished: true,
    })
    const without = sitemapRoutes({
      assistantDisabled: false,
      evalResultsPublished: false,
    })
    expect(withRun.some(route => route.href === '/ask/evals')).toBe(true)
    expect(without.some(route => route.href === '/ask/evals')).toBe(false)
    expect(without.length).toBe(withRun.length - 1)
  })

  test('the assistant routes are /ask and its eval results', () => {
    // Both go when the switch is on: the results page describes an
    // assistant that is not answering, and the link to it lives under the
    // chat pane that is not rendered either.
    expect(
      siteRoutes.filter(route => route.assistant).map(route => route.href)
    ).toEqual(['/ask', '/ask/evals'])
  })
})
