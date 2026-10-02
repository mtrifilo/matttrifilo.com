import { postLastModified, singleLineTitle } from '@/lib/blog'
import { JOB_TITLE } from './identity'

const SITE_URL = 'https://matttrifilo.com'

export interface PersonSchema {
  '@context': 'https://schema.org'
  '@type': 'Person'
  name: string
  url: string
  jobTitle: string
  sameAs: string[]
}

export interface BlogPostingSchema {
  '@context': 'https://schema.org'
  '@type': 'BlogPosting'
  headline: string
  datePublished: string
  dateModified: string
  description?: string
  image: string
  author: {
    '@type': 'Person'
    name: string
    url: string
  }
  url: string
  mainEntityOfPage: {
    '@type': 'WebPage'
    '@id': string
  }
}

export function generatePersonSchema(): PersonSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Matt Trifilo',
    url: SITE_URL,
    jobTitle: JOB_TITLE,
    sameAs: [
      'https://github.com/mtrifilo',
      'https://linkedin.com/in/matttrifilo',
    ],
  }
}

/**
 * The post's social card: the route app/blog/[slug]/opengraph-image.tsx
 * serves, the same image og:image points at. Next adds a content-hash
 * query to og:image for cache busting; the path alone serves the same
 * image.
 */
export function postImageUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}/opengraph-image`
}

export function generateBlogPostingSchema(post: {
  title: string
  date: string
  updated?: string
  description?: string
  slug: string
}): BlogPostingSchema {
  const canonicalUrl = `${SITE_URL}/blog/${post.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: singleLineTitle(post.title),
    datePublished: post.date,
    dateModified: postLastModified(post),
    description: post.description,
    image: postImageUrl(post.slug),
    author: {
      '@type': 'Person',
      name: 'Matt Trifilo',
      url: SITE_URL,
    },
    url: canonicalUrl,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
  }
}
