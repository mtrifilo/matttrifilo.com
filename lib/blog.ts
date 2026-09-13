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
 * YAML parses an unquoted `date: 2026-03-01` into a JS Date (UTC midnight),
 * while a quoted one stays a string. Everything downstream (formatDate,
 * <time dateTime>, JSON-LD datePublished) expects the `YYYY-MM-DD` string
 * the author wrote, so normalize here at the boundary.
 *
 * Only a pure calendar date is accepted. A value with a time of day or an
 * offset has no single correct calendar day (it would shift by timezone),
 * and a missing date cannot be sorted or displayed, so both fail loudly
 * at build time instead of rendering "Invalid Date" or the wrong day.
 */
export function normalizeFrontmatterDate(value: unknown, source: string): string {
  if (value instanceof Date) {
    const isMidnightUtc =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0
    if (!isMidnightUtc) {
      throw new Error(
        `${source}: frontmatter date must be a plain YYYY-MM-DD (got ${value.toISOString()})`
      )
    }
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }
  throw new Error(
    `${source}: frontmatter date must be a plain YYYY-MM-DD (got ${JSON.stringify(value)})`
  )
}

/**
 * Get a single blog post by slug
 */
export function getBlogPost(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_CONTENT_PATH, `${slug}.md`)

  // A missing file is "no such post" and callers 404. Anything after this
  // point (unreadable file, bad YAML, bad date) is an authoring error and
  // is allowed to throw so `next build` fails with the file name.
  if (!fs.existsSync(filePath)) {
    return null
  }

  const fileContents = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(fileContents)

  const frontmatter: BlogPostFrontmatter = {
    ...(data as Omit<BlogPostFrontmatter, 'date'>),
    date: normalizeFrontmatterDate(data.date, `content/blog/${slug}.md`),
  }

  return {
    slug,
    frontmatter,
    content,
    excerpt: extractExcerpt(content),
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
