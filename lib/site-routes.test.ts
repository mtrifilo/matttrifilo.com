import { describe, expect, test } from 'bun:test'
import sitemap from '@/app/sitemap'
import { siteRoutes } from './site-routes'

describe('sitemap', () => {
  test('includes every static route the nav links to', () => {
    const urls = new Set(sitemap().map(entry => entry.url))
    for (const route of siteRoutes) {
      const expected =
        route.href === '/' ? 'https://matttrifilo.com' : `https://matttrifilo.com${route.href}`
      expect(urls.has(expected)).toBe(true)
    }
  })

  test('includes every blog post on disk', () => {
    const urls = sitemap().map(entry => entry.url)
    expect(urls.some(u => u.includes('/blog/from-typing-code-to-agent-factories'))).toBe(true)
  })
})
