import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { BlogPost, BlogPostMeta, BlogPostFrontmatter } from './types/blog'

const BLOG_CONTENT_PATH = path.join(process.cwd(), 'content', 'blog')

/**
 * Get all blog post slugs for static generation.
 *
 * `contentDir` on this and the other loaders lets tests read fixture
 * posts; the site always reads content/blog.
 */
export function getBlogSlugs(contentDir = BLOG_CONTENT_PATH): string[] {
  // A missing or unreadable content directory is a build misconfiguration,
  // not "no posts yet", so let readdirSync throw (consistent with
  // getBlogPost, which also fails loudly on authoring errors).
  return fs
    .readdirSync(contentDir)
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

/** A `key: YYYY-MM-DD` line at the top level, the date optionally quoted. */
const FRONTMATTER_DATE_LINES = {
  date: /^date:[ \t]*['"]?(\d{4}-\d{2}-\d{2})['"]?[ \t]*$/m,
  updated: /^updated:[ \t]*['"]?(\d{4}-\d{2}-\d{2})['"]?[ \t]*$/m,
} as const

// Tolerates a UTF-8 BOM and trailing whitespace on the opening fence, as
// gray-matter does, so a valid post is never rejected for either.
const FRONTMATTER_BLOCK = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---/

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
export function parseFrontmatterDate(
  rawFrontmatter: string,
  source: string
): string {
  if (rawFrontmatter.trim() === '') {
    throw new Error(
      `${source}: no frontmatter block found (expected --- fences at the top)`
    )
  }
  return readDateLine(rawFrontmatter, 'date', source)
}

/**
 * The one rule behind `date` and `updated`: read from the raw line, not
 * the parsed YAML value, for the reasons parseFrontmatterDate gives.
 */
function readDateLine(
  rawFrontmatter: string,
  key: keyof typeof FRONTMATTER_DATE_LINES,
  source: string
): string {
  const match = FRONTMATTER_DATE_LINES[key].exec(rawFrontmatter)
  if (!match) {
    throw new Error(
      `${source}: frontmatter needs a plain "${key}: YYYY-MM-DD" line (no time, no offset)`
    )
  }
  const value = match[1]
  const roundTrip = new Date(`${value}T00:00:00Z`)
  if (
    Number.isNaN(roundTrip.getTime()) ||
    roundTrip.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(
      `${source}: frontmatter ${key} is not a real calendar date (got ${value})`
    )
  }
  return value
}

/** How a wrong value reads in an error message. */
function describeValue(value: unknown): string {
  if (value === null || value === undefined) return 'nothing'
  if (Array.isArray(value)) return 'a list'
  if (value instanceof Date) return 'a date'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'object') return 'a mapping'
  return `the ${typeof value} ${String(value)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Every key a post may declare. Anything else is an error rather than
 * something ignored, as in the knowledge twin's loader: a silently ignored
 * `descripton:` is a post that loads and is wrong, and an ignored
 * `draft: true` publishes a post its author meant to hold back.
 */
const DECLARED_KEYS = {
  title: true,
  date: true,
  description: true,
  categories: true,
  updated: true,
} satisfies Record<keyof BlogPostFrontmatter, true>

// From an object `satisfies` checks in both directions, so a field added
// to BlogPostFrontmatter without a key here fails typecheck.
const FRONTMATTER_KEYS = Object.keys(DECLARED_KEYS)

/**
 * Checks parsed frontmatter against BlogPostFrontmatter and returns the
 * typed fields. This is where a post file stops being untrusted input:
 * past it, every field has the type the pages assume, so a post that
 * would render "undefined" or break a category page fails the build here
 * instead, with the file name.
 *
 * Present means valid: an optional field that is written must hold the
 * right type, because an empty or mistyped field is an authoring slip,
 * not a request to leave it out.
 */
function validateFrontmatter(
  data: unknown,
  rawFrontmatter: string,
  source: string
): BlogPostFrontmatter {
  const date = parseFrontmatterDate(rawFrontmatter, source)
  if (!isRecord(data)) {
    throw new Error(
      `${source}: frontmatter must be "key: value" lines (got ${describeValue(data)})`
    )
  }
  for (const key of Object.keys(data)) {
    if (!FRONTMATTER_KEYS.includes(key)) {
      throw new Error(
        `${source}: unknown frontmatter key "${key}". A post declares ${FRONTMATTER_KEYS.join(', ')} and nothing else.`
      )
    }
  }

  const { title, description, categories } = data
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error(
      `${source}: frontmatter needs a title, as text (got ${describeValue(title)})`
    )
  }
  const frontmatter: BlogPostFrontmatter = { title, date }

  if ('description' in data) {
    // Blank is refused too: the pages fall back to the excerpt only when
    // the description is falsy, so '  ' would ship an empty meta tag.
    if (typeof description !== 'string' || description.trim() === '') {
      throw new Error(
        `${source}: frontmatter description must be text (got ${describeValue(description)})`
      )
    }
    frontmatter.description = description
  }

  if ('categories' in data) {
    if (!Array.isArray(categories)) {
      throw new Error(
        `${source}: frontmatter categories must be a list (got ${describeValue(categories)})`
      )
    }
    for (const category of categories) {
      if (typeof category !== 'string' || category.trim() === '') {
        throw new Error(
          `${source}: each category must be text; quote a value YAML would read as a number or a boolean (got ${describeValue(category)})`
        )
      }
    }
    frontmatter.categories = categories
  }

  if ('updated' in data) {
    frontmatter.updated = readDateLine(rawFrontmatter, 'updated', source)
  }

  return frontmatter
}

/**
 * gray-matter, with the file name on a YAML error.
 *
 * The empty options object is load-bearing: called without one,
 * gray-matter caches a file before parsing it, so a second read of a file
 * whose YAML failed returns empty data instead of throwing again.
 */
function parseMatter(fileContents: string, source: string) {
  try {
    return matter(fileContents, {})
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${source}: frontmatter is not valid YAML: ${reason}`, {
      cause: error,
    })
  }
}

/**
 * Get a single blog post by slug
 */
export function getBlogPost(
  slug: string,
  contentDir = BLOG_CONTENT_PATH
): BlogPost | null {
  const filePath = path.join(contentDir, `${slug}.md`)

  // A missing file is "no such post" and callers 404. Anything after this
  // point (unreadable file, bad YAML, a missing or mistyped field) is an
  // authoring error and throws so `next build` fails with the file name.
  if (!fs.existsSync(filePath)) {
    return null
  }

  const fileContents = fs.readFileSync(filePath, 'utf8')
  const source = path.relative(process.cwd(), filePath)
  const parsed = parseMatter(fileContents, source)
  const frontmatter = validateFrontmatter(
    parsed.data,
    rawFrontmatterBlock(fileContents),
    source
  )

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
export function getAllBlogPosts(
  contentDir = BLOG_CONTENT_PATH
): BlogPostMeta[] {
  const slugs = getBlogSlugs(contentDir)
  const posts: BlogPostMeta[] = []

  for (const slug of slugs) {
    const post = getBlogPost(slug, contentDir)
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

  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

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
