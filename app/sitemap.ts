import type { MetadataRoute } from 'next'
import { getBlogSlugs } from '@/lib/blog'
import { sitemapRoutes } from '@/lib/site-routes'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { hasPublishedEvalRun } from '@/lib/evals/results'

const baseUrl = 'https://matttrifilo.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = sitemapRoutes({
    assistantDisabled: isChatDisabled(),
    evalResultsPublished: hasPublishedEvalRun(),
  }).map(route => ({
    url: route.href === '/' ? baseUrl : `${baseUrl}${route.href}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const blogPages: MetadataRoute.Sitemap = getBlogSlugs().map(slug => ({
    url: `${baseUrl}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  // The assistant's corpus is not listed: nothing serves a corpus document,
  // so there is no URL to offer. What was read is disclosed in the answer
  // itself, above the text.
  return [...staticPages, ...blogPages]
}
