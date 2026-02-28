import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { BlogPost, BlogPostMeta, BlogPostFrontmatter } from './types/blog'

const BLOG_CONTENT_PATH = path.join(process.cwd(), 'content', 'blog')

/**
 * Get all blog post slugs for static generation
 */
export function getBlogSlugs(): string[] {
  try {
    const files = fs.readdirSync(BLOG_CONTENT_PATH)
    return files
      .filter(file => file.endsWith('.md') && !file.startsWith('_'))
      .map(file => file.replace(/\.md$/, ''))
  } catch {
    return []
  }
}

/**
 * Extract a plain text excerpt from markdown content
 */
function extractExcerpt(content: string, maxLength = 200): string {
  let text = content.replace(/<[^>]+\/>/g, '')
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  text = text.replace(/[#*_`\[\]]/g, '')
  text = text.replace(/\s+/g, ' ').trim()
  if (text.length > maxLength) {
    text = text.substring(0, maxLength).trim() + '...'
  }
  return text
}

/**
 * Get a single blog post by slug
 */
export function getBlogPost(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_CONTENT_PATH, `${slug}.md`)

  try {
    if (!fs.existsSync(filePath)) {
      return null
    }

    const fileContents = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(fileContents)

    const frontmatter = data as BlogPostFrontmatter

    return {
      slug,
      frontmatter,
      content,
      excerpt: extractExcerpt(content),
    }
  } catch {
    return null
  }
}

/**
 * Get all blog posts metadata for listing (sorted by date, newest first)
 */
export function getAllBlogPosts(): BlogPostMeta[] {
  const slugs = getBlogSlugs()
  const posts: BlogPostMeta[] = []

  for (const slug of slugs) {
    const post = getBlogPost(slug)
    if (!post) continue

    posts.push({
      slug: post.slug,
      title: post.frontmatter.title,
      date: post.frontmatter.date,
      categories: post.frontmatter.categories || [],
      description: post.frontmatter.description,
      excerpt: post.excerpt,
    })
  }

  posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return posts
}

/**
 * Get all unique categories from blog posts
 */
export function getAllCategories(): string[] {
  const posts = getAllBlogPosts()
  const categoriesSet = new Set<string>()

  for (const post of posts) {
    for (const category of post.categories) {
      categoriesSet.add(category)
    }
  }

  return Array.from(categoriesSet).sort()
}

/**
 * Get all posts for a specific category
 */
export function getPostsByCategory(category: string): BlogPostMeta[] {
  const posts = getAllBlogPosts()
  return posts.filter(post =>
    post.categories.some(
      cat => cat.toLowerCase().replace(/\s+/g, '-') === category
    )
  )
}
