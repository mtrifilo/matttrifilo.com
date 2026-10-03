import { describe, expect, test } from 'bun:test'
import { getBlogPost, getBlogSlugs } from '@/lib/blog'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { hasPublishedEvalRun } from '@/lib/evals/results'
import { sitemapRoutes, visibleSiteRoutes } from '@/lib/site-routes'
import sitemap from './sitemap'

/**
 * lib/site-routes.test.ts checks that every static route and every post is
 * in the sitemap. These check the other direction for posts: nothing is in
 * it twice, and nothing is in it that is neither a route nor a post.
 */
const BASE = 'https://matttrifilo.com'
const POST_PREFIX = `${BASE}/blog/`

const urls = sitemap().map(entry => entry.url)

describe('the sitemap per post', () => {
  test('has exactly one entry for each post getBlogSlugs lists, and no other post URL', () => {
    const postUrls = urls.filter(url => url.startsWith(POST_PREFIX))
    const expected = getBlogSlugs().map(slug => `${POST_PREFIX}${slug}`)
    expect(expected.length).toBeGreaterThan(0)
    expect(postUrls.sort()).toEqual(expected.sort())
  })

  test('every post URL names a post the loader can read', () => {
    for (const url of urls.filter(url => url.startsWith(POST_PREFIX))) {
      const slug = url.slice(POST_PREFIX.length)
      expect(getBlogPost(slug)?.slug).toBe(slug)
    }
  })
})

describe('the sitemap as a whole', () => {
  test('lists each URL once, and only routes and posts', () => {
    const routeUrls = sitemapRoutes({
      assistantDisabled: isChatDisabled(),
      evalResultsPublished: hasPublishedEvalRun(),
    }).map(route => (route.href === '/' ? BASE : `${BASE}${route.href}`))
    const postUrls = getBlogSlugs().map(slug => `${POST_PREFIX}${slug}`)
    expect(new Set(urls).size).toBe(urls.length)
    expect([...urls].sort()).toEqual([...routeUrls, ...postUrls].sort())
  })

  test('every route the nav links is offered, in every kill-switch and eval-run state', () => {
    // app/nav.tsx links visibleSiteRoutes minus hideFromNav. The sitemap
    // drops a route only while it has nothing worth indexing, so that
    // route must stay out of the nav too, or the nav links a page the
    // sitemap withholds.
    for (const assistantDisabled of [false, true]) {
      const navHrefs = visibleSiteRoutes({ assistantDisabled })
        .filter(route => !route.hideFromNav)
        .map(route => route.href)
      for (const evalResultsPublished of [false, true]) {
        const offered = sitemapRoutes({
          assistantDisabled,
          evalResultsPublished,
        }).map(route => route.href)
        for (const href of navHrefs) expect(offered).toContain(href)
      }
    }
  })
})
