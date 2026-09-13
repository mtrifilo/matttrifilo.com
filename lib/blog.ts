import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { BlogPost, BlogPostMeta, BlogPostFrontmatter } from './types/blog'

const BLOG_CONTENT_PATH = path.join(process.cwd(), 'content', 'blog')

/**
 * Get all blog post slugs for static generation
 */
export function getBlogSlugs(): string[] {
  // A missing or unreadable content directory is a build misconfiguration,
  // not "no posts yet", so let readdirSync throw (consistent with
  // getBlogPost, which also fails loudly on authoring errors).
  return fs
    .readdirSync(BLOG_CONTENT_PATH)
    .filter(file => file.endsWith('.md') && !file.startsWith('_'))
    .map(file => file.replace(/\.md$/, ''))
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

const FRONTMATTER_DATE_LINE = /^date:[ \t]*['"]?(\d{4}-\d{2}-\d{2})['"]?[ \t]*$/m
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/

/**
 * The raw text between the opening and closing `---` fences, or '' when
 * the file has no frontmatter. Sliced from the file ourselves rather than
 * read from gray-matter's `.matter` field, which is not reliably populated
 * on its internal cache-hit path.
 */
export function rawFrontmatterBlock(fileContents: string): string {
  const match = FRONTMATTER_BLOCK.exec(fileContents)
  return match ? match[1] : ''
}

/**
 * Reads the post date from the raw frontmatter text and returns it as the
 * `YYYY-MM-DD` string the author wrote.
 *
 * The parsed YAML value is deliberately not used: YAML turns an unquoted
 * `date: 2026-03-01` into a JS Date, and a timestamp with an offset or a
 * typo like `2026-02-30` becomes a Date on a different calendar day with
 * no trace of the original text. Validating the source line is the only
 * way to guarantee the date on the page is the one in the file. Anything
 * that is not a plain, real calendar date fails the build with the file
 * name rather than rendering "Invalid Date" or the wrong day.
 */
export function parseFrontmatterDate(rawFrontmatter: string, source: string): string {
  const match = FRONTMATTER_DATE_LINE.exec(rawFrontmatter)
  if (!match) {
    throw new Error(
      `${source}: frontmatter needs a plain "date: YYYY-MM-DD" line (no time, no offset)`
    )
  }
  const value = match[1]
  const roundTrip = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(roundTrip.getTime()) || roundTrip.toISOString().slice(0, 10) !== value) {
    throw new Error(`${source}: frontmatter date is not a real calendar date (got ${value})`)
  }
  return value
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
  const parsed = matter(fileContents)
  const source = path.relative(process.cwd(), filePath)

  const frontmatter: BlogPostFrontmatter = {
    ...(parsed.data as Omit<BlogPostFrontmatter, 'date'>),
    date: parseFrontmatterDate(rawFrontmatterBlock(fileContents), source),
  }

  return {
    slug,
    frontmatter,
    content: parsed.content,
    excerpt: extractExcerpt(parsed.content),
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
