import { compile } from '@mdx-js/mdx'
import { toHtml } from 'hast-util-to-html'
import type { Element, Root, RootContent } from 'hast'
import { getAllBlogPosts, getBlogPost } from '@/lib/blog'

const SITE_URL = 'https://matttrifilo.com'

/** Where the feed is served; app/feed.xml/route.ts is the route. */
export const FEED_PATH = '/feed.xml'

// The site's own name (openGraph siteName in app/layout.tsx) and the blog
// index's description (app/blog/page.tsx), so a reader names the feed the
// way the site names itself.
const FEED_TITLE = 'Matt Trifilo'
const FEED_DESCRIPTION =
  'Blog posts about software development, technology, and engineering.'

/** One post as the feed carries it. */
export interface FeedItem {
  slug: string
  title: string
  /** `YYYY-MM-DD`, as the post's frontmatter gives it. */
  date: string
  categories: string[]
  /** A plain-text summary: the frontmatter description, else the excerpt. */
  summary: string
  /** The post body as HTML, with every URL absolute. */
  html: string
}

/** The canonical URL of a post, the same one its page declares. */
export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}`
}

/**
 * The RFC 822 date RSS 2.0 requires, for a `YYYY-MM-DD` post date.
 *
 * A post has a calendar date and no time, and a reader shows pubDate in
 * its own time zone. Midnight UTC would show the day before anywhere in
 * the Americas (the bug lib/format-date.ts guards against on the page, in
 * someone else's app), so the time is noon UTC: the written date from
 * UTC-12 to UTC+11. Built from an explicit UTC
 * instant and printed with toUTCString, so the process time zone never
 * enters it.
 */
export function rfc822Date(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toUTCString()
}

// XML 1.0 forbids most control characters even when escaped.
const NOT_XML_CHARACTER =
  /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu

/** Text safe to place in XML character data or a quoted attribute. */
export function escapeXml(text: string): string {
  return text
    .replace(NOT_XML_CHARACTER, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * A post body as HTML for a feed reader, parsed by the same MDX compiler
 * /blog/[slug] renders it with (next-mdx-remote calls @mdx-js/mdx), so the
 * feed and the page cannot disagree about what the Markdown means.
 *
 * The HTML is taken from the compiler's HTML tree, before it becomes
 * JavaScript, so no React renderer is needed in a route handler.
 */
export async function renderPostHtml(
  markdown: string,
  slug: string
): Promise<string> {
  let html: string | undefined
  const toFeedHtml = () => (tree: Root) => {
    html = toHtml(prepareForFeed(structuredClone(tree), slug))
  }
  await compile(markdown, { rehypePlugins: [toFeedHtml] })
  if (html === undefined) {
    throw new Error(`content/blog/${slug}.md: the MDX compile produced no HTML`)
  }
  return html
}

/**
 * What the feed changes in a post's HTML tree, in place:
 *
 * - Headings drop one level, as components/blog/mdx-content.tsx does on the
 *   page: a reader shows the item title above the body, so `#` is a second
 *   level heading there too, and `#####` and `######` both land on <h6>.
 * - Relative links and images resolve against the post's URL, since a
 *   reader has no base to resolve them against.
 * - JSX, expressions and imports are refused. A post is plain Markdown:
 *   its knowledge twin must be byte-identical and the corpus build refuses
 *   `<` and `{` outside code (lib/knowledge/build.ts), so one of these here
 *   means that guard was bypassed, and the feed says so rather than
 *   printing something the page would not.
 */
function prepareForFeed(tree: Root, slug: string): Root {
  const visit = (node: Root | RootContent) => {
    if (node.type.startsWith('mdx')) {
      throw new Error(
        `content/blog/${slug}.md: the feed renders plain Markdown only, and this post has MDX syntax (${node.type})`
      )
    }
    if (node.type === 'element') {
      demoteHeading(node)
      absolutizeUrl(node, 'href', slug)
      absolutizeUrl(node, 'src', slug)
    }
    if ('children' in node) node.children.forEach(visit)
  }
  visit(tree)
  return tree
}

const HEADING = /^h([1-6])$/

function demoteHeading(element: Element): void {
  const match = HEADING.exec(element.tagName)
  if (match) element.tagName = `h${Math.min(Number(match[1]) + 1, 6)}`
}

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i

function absolutizeUrl(
  element: Element,
  property: 'href' | 'src',
  slug: string
): void {
  const value = element.properties[property]
  if (typeof value !== 'string' || HAS_SCHEME.test(value)) return
  element.properties[property] = new URL(value, postUrl(slug)).href
}

/** Every published post, newest first, ready for the feed. */
export async function loadFeedItems(): Promise<FeedItem[]> {
  return Promise.all(
    getAllBlogPosts().map(async meta => {
      const post = getBlogPost(meta.slug)
      if (!post) {
        throw new Error(`content/blog/${meta.slug}.md disappeared mid-build`)
      }
      return {
        slug: meta.slug,
        title: meta.title,
        date: meta.date,
        categories: meta.categories,
        summary: meta.description || meta.excerpt,
        html: await renderPostHtml(post.content, meta.slug),
      }
    })
  )
}

/** A title on one line: some post titles break with `\n` on the page. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function renderItem(item: FeedItem): string {
  const url = postUrl(item.slug)
  return [
    '    <item>',
    `      <title>${escapeXml(oneLine(item.title))}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
    `      <pubDate>${rfc822Date(item.date)}</pubDate>`,
    ...item.categories.map(
      category => `      <category>${escapeXml(category)}</category>`
    ),
    `      <description>${escapeXml(item.summary)}</description>`,
    `      <content:encoded>${escapeXml(item.html)}</content:encoded>`,
    '    </item>',
  ].join('\n')
}

/**
 * An RSS 2.0 document for these items, which must be newest first. The
 * summary goes in <description> and the full post in <content:encoded>,
 * the module readers use for full text. lastBuildDate is the newest post's
 * date, so the document changes only when the posts do.
 */
export function renderRssFeed(items: FeedItem[]): string {
  const newest = items[0]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    `    <title>${escapeXml(FEED_TITLE)}</title>`,
    `    <link>${SITE_URL}/blog</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    '    <language>en-us</language>',
    ...(newest
      ? [`    <lastBuildDate>${rfc822Date(newest.date)}</lastBuildDate>`]
      : []),
    `    <atom:link href="${SITE_URL}${FEED_PATH}" rel="self" type="application/rss+xml"/>`,
    ...items.map(renderItem),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}

/** The feed for the posts on disk. */
export async function buildRssFeed(): Promise<string> {
  return renderRssFeed(await loadFeedItems())
}
