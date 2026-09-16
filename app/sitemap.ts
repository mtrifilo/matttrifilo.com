import type { MetadataRoute } from 'next'
import { getBlogSlugs } from '@/lib/blog'
import { listKnowledgeDocuments } from '@/lib/knowledge'
import { visibleSiteRoutes } from '@/lib/site-routes'
import { isChatDisabled } from '@/lib/chat/kill-switch'

const baseUrl = 'https://matttrifilo.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = visibleSiteRoutes({
    assistantDisabled: isChatDisabled(),
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

  // The career assistant's corpus. These are listed so the documents are
  // findable — an assistant whose sources cannot be looked up is an
  // assistant that has to be taken on faith. Where a document is a copy of
  // something already published (a post, the résumé), its page declares
  // that original as its canonical, so listing both is not a duplicate
  // claim. `updated` is the author's own date, which is what changed.
  const knowledgePages: MetadataRoute.Sitemap = isChatDisabled()
    ? []
    : listKnowledgeDocuments().map(document => ({
        url: `${baseUrl}${document.url}`,
        lastModified: new Date(document.updated),
        changeFrequency: 'monthly',
        priority: 0.4,
      }))

  return [...staticPages, ...blogPages, ...knowledgePages]
}
