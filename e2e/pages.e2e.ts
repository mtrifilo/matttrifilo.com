import { getAllBlogPosts } from '@/lib/blog'
import { siteRoutes } from '@/lib/site-routes'
import { expect, horizontalOverflow, test } from './support'

/**
 * Every page the site serves, loaded once per project: no console error and
 * no uncaught error on any of them (the fixture in ./support.ts checks both
 * after each test), and none scrolls sideways on a phone.
 *
 * The routes come from the list the nav and the sitemap are built from, so a
 * page added there is checked here without an edit; the newest blog post
 * stands in for the post template.
 */

const newestPost = getAllBlogPosts()[0]
const PATHS = [
  ...siteRoutes.map(route => route.href),
  ...(newestPost ? [`/blog/${newestPost.slug}`] : []),
]

for (const path of PATHS) {
  test(`${path} loads cleanly`, async ({ page, isMobile }) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await page.waitForLoadState('networkidle')
    if (isMobile) expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
}
