import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import sitemap from '@/app/sitemap'
import { getBlogSlugs } from './blog'
import { siteRoutes, visibleSiteRoutes } from './site-routes'
import { isChatDisabled } from './chat/kill-switch'

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
  test('includes every static route', () => {
    const urls = new Set(sitemap().map(entry => entry.url))
    // The environment decides whether the assistant's pages exist, so the
    // expectation reads the same switch the sitemap does (a `vercel env
    // pull` puts production's CHAT_DISABLED=1 into .env.local).
    const expected = visibleSiteRoutes({ assistantDisabled: isChatDisabled() })
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

  test('the assistant routes are /ask and its eval results', () => {
    // Both go when the switch is on: the results page describes an
    // assistant that is not answering, and the link to it lives under the
    // chat pane that is not rendered either.
    expect(
      siteRoutes.filter(route => route.assistant).map(route => route.href)
    ).toEqual(['/ask', '/ask/evals'])
  })
})
