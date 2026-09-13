import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import sitemap from '@/app/sitemap'
import { getBlogSlugs } from './blog'
import { siteRoutes } from './site-routes'

const BASE = 'https://matttrifilo.com'
const toUrl = (href: string) => (href === '/' ? BASE : `${BASE}${href}`)

/** Every static route in app/ (a page.tsx with no dynamic segment). */
function staticRoutesOnDisk(): string[] {
  const appDir = path.join(process.cwd(), 'app')
  const routes: string[] = []
  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('[')) continue // dynamic: covered separately
        walk(path.join(dir, entry.name), [...segments, entry.name])
      } else if (entry.name === 'page.tsx') {
        routes.push(segments.length === 0 ? '/' : `/${segments.join('/')}`)
      }
    }
  }
  walk(appDir, [])
  return routes.sort()
}

describe('siteRoutes', () => {
  test('lists exactly the static pages that exist in app/', () => {
    // Fails when a page.tsx is added without a siteRoutes entry (the way
    // /books went missing from the sitemap), or when a route is listed
    // that has no page.
    const listed = siteRoutes.map(r => r.href).sort()
    expect(listed).toEqual(staticRoutesOnDisk())
  })
})

describe('sitemap', () => {
  test('includes every static route', () => {
    const urls = new Set(sitemap().map(entry => entry.url))
    for (const route of siteRoutes) expect(urls.has(toUrl(route.href))).toBe(true)
  })

  test('includes every blog post on disk', () => {
    const slugs = getBlogSlugs()
    expect(slugs.length).toBeGreaterThan(0)
    const urls = new Set(sitemap().map(entry => entry.url))
    for (const slug of slugs) expect(urls.has(`${BASE}/blog/${slug}`)).toBe(true)
  })
})
