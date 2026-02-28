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
  dateModified?: string
  description?: string
  author: {
    '@type': 'Person'
    name: string
    url: string
  }
  url: string
}

export function generatePersonSchema(): PersonSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Matt Trifilo',
    url: 'https://matttrifilo.com',
    jobTitle: 'Software Engineer',
    sameAs: [
      'https://github.com/mtrifilo',
      'https://linkedin.com/in/matttrifilo',
    ],
  }
}

export function generateBlogPostingSchema(post: {
  title: string
  date: string
  description?: string
  slug: string
}): BlogPostingSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.date,
    dateModified: post.date,
    description: post.description,
    author: {
      '@type': 'Person',
      name: 'Matt Trifilo',
      url: 'https://matttrifilo.com',
    },
    url: `https://matttrifilo.com/blog/${post.slug}`,
  }
}
