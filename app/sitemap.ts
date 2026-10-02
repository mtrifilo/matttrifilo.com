import type { MetadataRoute } from 'next'
import { getAllBlogPosts, postLastModified } from '@/lib/blog'
import { routeLastModified, sitemapRoutes } from '@/lib/site-routes'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { latestEvalSummary } from '@/lib/evals/results'

const baseUrl = 'https://matttrifilo.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllBlogPosts()
  const latestRun = latestEvalSummary()
  const newest = {
    // A listing shows each post's title and publish date, so a new post
    // changes it and an edit to a post's body does not.
    post: posts
      .map(post => post.date)
      .sort()
      .at(-1),
    // ranAt is a UTC ISO timestamp, and its first ten characters are the
    // run's day in UTC, the zone the eval results page dates it in.
    evalRun: latestRun?.ranAt.slice(0, 10),
  }

  const staticPages: MetadataRoute.Sitemap = sitemapRoutes({
    assistantDisabled: isChatDisabled(),
    evalResultsPublished: latestRun !== null,
  }).map(route => ({
    url: route.href === '/' ? baseUrl : `${baseUrl}${route.href}`,
    lastModified: routeLastModified(route, newest),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const blogPages: MetadataRoute.Sitemap = posts.map(post => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: postLastModified(post),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  // The assistant's corpus is not listed: nothing serves a corpus document,
  // so there is no URL to offer. What was read is disclosed in the answer
  // itself, above the text.
  return [...staticPages, ...blogPages]
}
