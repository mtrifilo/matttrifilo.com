import type { MetadataRoute } from 'next'
import { getBlogSlugs } from '@/lib/blog'
import { siteRoutes } from '@/lib/site-routes'

const baseUrl = 'https://matttrifilo.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = siteRoutes.map(route => ({
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

  return [...staticPages, ...blogPages]
}
