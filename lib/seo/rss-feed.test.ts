import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Metadata } from 'next'
import { resolveAlternates } from 'next/dist/lib/metadata/resolvers/resolve-basics'
import { Window } from 'happy-dom'
import { dynamic, GET } from '@/app/feed.xml/route'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { getAllBlogPosts } from '@/lib/blog'
import { FEED_PATH } from './feed'
import {
  escapeXml,
  postUrl,
  renderPostHtml,
  renderRssFeed,
  rfc822Date,
  type FeedItem,
} from './rss-feed'

/**
 * The document as an XML parser sees it. happy-dom's parser reports a
 * mismatched tag or an undefined entity but accepts a bare `&`, so this is
 * a structural check; escapeXml's own test covers the ampersand, and the
 * W3C validator is the full check (see the pull request).
 */
function parseXml(xml: string): Document {
  const window = new Window()
  const document = new window.DOMParser().parseFromString(
    xml,
    'application/xml'
  ) as unknown as Document
  const error = document.getElementsByTagName('parsererror')[0]
  if (error) throw new Error(`not well formed: ${error.textContent}`)
  return document
}

const texts = (document: Document, tag: string) =>
  Array.from(document.getElementsByTagName(tag)).map(el => el.textContent)

const item = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  slug: 'a-post',
  title: 'A post',
  date: '2026-03-01',
  categories: [],
  summary: 'A summary.',
  html: '<p>Body.</p>',
  ...overrides,
})

describe('rfc822Date', () => {
  test('is noon UTC on the written date', () => {
    expect(rfc822Date('2026-03-01')).toBe('Sun, 01 Mar 2026 12:00:00 GMT')
    expect(rfc822Date('2025-12-31')).toBe('Wed, 31 Dec 2025 12:00:00 GMT')
  })

  test('is the same whatever time zone the build runs in', () => {
    // CI runs the suite under TZ=America/Phoenix only, and Bun does not
    // reliably apply a TZ changed mid-process, so each zone gets its own
    // process.
    const script = `import { rfc822Date } from './lib/seo/rss-feed'; console.log(rfc822Date('2026-03-01'))`
    for (const TZ of ['UTC', 'America/Phoenix', 'Pacific/Kiritimati']) {
      const run = Bun.spawnSync([process.execPath, '-e', script], {
        cwd: join(import.meta.dir, '..', '..'),
        env: { ...process.env, TZ },
      })
      expect(`${TZ}: ${run.stdout.toString().trim()}`).toBe(
        `${TZ}: Sun, 01 Mar 2026 12:00:00 GMT`
      )
    }
  })

  test('shows the written date to a reader from Hawaii to Tokyo', () => {
    const instant = new Date(rfc822Date('2026-03-01'))
    for (const timeZone of [
      'Pacific/Honolulu',
      'America/Phoenix',
      'America/Chicago',
      'UTC',
      'Europe/Berlin',
      'Asia/Tokyo',
    ]) {
      const shown = instant.toLocaleDateString('en-US', {
        timeZone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      expect(`${timeZone}: ${shown}`).toBe(`${timeZone}: March 1, 2026`)
    }
  })
})

describe('escapeXml', () => {
  test('escapes markup characters and drops what XML cannot carry', () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;'
    )
    expect(escapeXml('bell\u0007 tab\t emoji \u{1F600}')).toBe(
      'bell tab\t emoji \u{1F600}'
    )
  })
})

describe('renderPostHtml', () => {
  test('demotes every heading one level, as the page does', async () => {
    const html = await renderPostHtml(
      '# One\n\n## Two\n\n#### Four\n\n##### Five\n\n###### Six\n',
      'a-post'
    )
    expect(html).toContain('<h2>One</h2>')
    expect(html).toContain('<h3>Two</h3>')
    expect(html).toContain('<h5>Four</h5>')
    expect(html).toContain('<h6>Five</h6>')
    expect(html).toContain('<h6>Six</h6>')
    expect(html).not.toContain('<h1>')
  })

  test('makes relative links and images absolute and leaves absolute ones alone', async () => {
    const html = await renderPostHtml(
      [
        '[site](/blog/other) [here](#section) [ext](https://example.com)',
        '[mail](mailto:someone@example.com)',
        '',
        '![alt](/images/x.png)',
      ].join('\n'),
      'a-post'
    )
    expect(html).toContain('href="https://matttrifilo.com/blog/other"')
    expect(html).toContain('href="https://matttrifilo.com/blog/a-post#section"')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="mailto:someone@example.com"')
    expect(html).toContain('src="https://matttrifilo.com/images/x.png"')
  })

  test('refuses MDX syntax rather than print something the page would not', async () => {
    await expect(
      renderPostHtml('Hello <Widget />\n', 'a-post')
    ).rejects.toThrow(/content\/blog\/a-post\.md.*mdxJsx/)
    await expect(renderPostHtml('Sum {1 + 1}\n', 'a-post')).rejects.toThrow(
      /content\/blog\/a-post\.md.*mdxTextExpression/
    )
  })
})

describe('renderRssFeed', () => {
  test('an empty blog is still a well formed feed', () => {
    const document = parseXml(renderRssFeed([]))
    expect(document.getElementsByTagName('item')).toHaveLength(0)
    expect(document.getElementsByTagName('lastBuildDate')).toHaveLength(0)
  })

  test('carries the summary, the full HTML and one line titles', () => {
    const document = parseXml(
      renderRssFeed([
        item({
          title: 'Line one.\nLine two & more',
          categories: ['AI', 'Careers'],
          html: '<p>Body with <a href="https://example.com?a=1&amp;b=2">a link</a>.</p>',
        }),
      ])
    )
    expect(texts(document, 'title')).toContain('Line one. Line two & more')
    expect(texts(document, 'description')).toContain('A summary.')
    expect(texts(document, 'category')).toEqual(['AI', 'Careers'])
    expect(texts(document, 'content:encoded')).toEqual([
      '<p>Body with <a href="https://example.com?a=1&amp;b=2">a link</a>.</p>',
    ])
    expect(texts(document, 'guid')).toEqual([postUrl('a-post')])
  })

  test('lastBuildDate is the newest post, which comes first', () => {
    const document = parseXml(
      renderRssFeed([
        item({ slug: 'new', date: '2026-04-02' }),
        item({ slug: 'old', date: '2025-12-31' }),
      ])
    )
    expect(texts(document, 'lastBuildDate')).toEqual([
      'Thu, 02 Apr 2026 12:00:00 GMT',
    ])
  })
})

describe('GET /feed.xml', () => {
  test('is prerendered at build time', () => {
    expect(dynamic).toBe('force-static')
  })

  test('serves every post on disk, newest first, with its date', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'application/rss+xml; charset=utf-8'
    )
    const document = parseXml(await response.text())

    const posts = getAllBlogPosts()
    expect(posts.length).toBeGreaterThan(0)
    expect(texts(document, 'link').slice(1)).toEqual(
      posts.map(post => postUrl(post.slug))
    )
    expect(texts(document, 'pubDate')).toEqual(
      posts.map(post => rfc822Date(post.date))
    )
    expect(texts(document, 'lastBuildDate')).toEqual([
      rfc822Date(posts[0].date),
    ])
    for (const html of texts(document, 'content:encoded')) {
      expect(html).toMatch(/^<(p|h2)>/)
      expect(html).not.toContain('<h1>')
    }
    const self = document.getElementsByTagName('atom:link')[0]
    expect(self.getAttribute('href')).toBe(
      `https://matttrifilo.com${FEED_PATH}`
    )
  })

  test('is not offered in the sitemap or robots', () => {
    expect(sitemap().some(entry => entry.url.endsWith(FEED_PATH))).toBe(false)
    expect(JSON.stringify(robots())).not.toContain(FEED_PATH)
  })
})

const ROOT = join(import.meta.dir, '..', '..')

/** Every page module under app/, as a path from the repository root. */
function pageFiles(): string[] {
  return readdirSync(join(ROOT, 'app'), { recursive: true })
    .map(String)
    .filter(file => /(^|\/)page\.tsx$/.test(file))
    .map(file => relative(ROOT, join(ROOT, 'app', file)))
    .sort()
}

type PageMetadata = {
  page: string
  metadata: Metadata
  params: Record<string, string>
}

/**
 * The page modules under app/, each with the metadata Next would resolve
 * for it: the static `metadata` export, or `generateMetadata` called with
 * the first static params of a dynamic route.
 */
async function pageMetadata(): Promise<PageMetadata[]> {
  const resolved: PageMetadata[] = []
  for (const page of pageFiles()) {
    const mod = await import(join(ROOT, page))
    if (mod.metadata)
      resolved.push({ page, metadata: mod.metadata, params: {} })
    if (!mod.generateMetadata) continue
    const [params = {}] = mod.generateStaticParams
      ? await mod.generateStaticParams()
      : []
    try {
      const metadata = await mod.generateMetadata({
        params: Promise.resolve(params),
      })
      resolved.push({ page, metadata, params })
    } catch (error) {
      // A page behind the assistant's kill switch 404s instead; the
      // not-found metadata is the layout's, which carries the feed.
      if (!String((error as { digest?: string }).digest).includes('404'))
        throw error
    }
  }
  return resolved
}

describe('feed autodiscovery', () => {
  test('the root layout advertises the feed', () => {
    // The layout imports next/font, which Bun cannot load, so its source is
    // read instead of its module.
    const layout = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8')
    expect(layout).toContain(`'application/rss+xml': '${FEED_PATH}'`)
  })

  test('every page that sets its own alternates keeps the feed in them', async () => {
    // A page's alternates replace the layout's whole object in Next.
    const pages = await pageMetadata()
    expect(pages.some(p => p.page === 'app/blog/[slug]/page.tsx')).toBe(true)
    for (const { page, metadata } of pages) {
      if (!metadata.alternates) continue
      const types = metadata.alternates.types as
        Record<string, unknown> | undefined
      expect(`${page}: ${types?.['application/rss+xml']}`).toBe(
        `${page}: ${FEED_PATH}`
      )
    }
  })
})

/** The URL path a page module serves, its dynamic segments filled in. */
function routePath(page: string, params: Record<string, string>): string {
  const segments = page
    .replace(/^app\//, '')
    .replace(/(^|\/)page\.tsx$/, '')
    .split('/')
    .filter(segment => segment && !/^\(.*\)$/.test(segment))
    .map(segment => {
      const dynamic = /^\[(.+)\]$/.exec(segment)
      if (!dynamic) return segment
      const value = params[dynamic[1]]
      if (!value) throw new Error(`${page}: no static param ${dynamic[1]}`)
      return value
    })
  return `/${segments.join('/')}`
}

/**
 * One canonical link per page, at the page's own path on the apex (MTC-13).
 * Each page's alternates go through Next's own resolver against the root
 * layout's metadataBase, so a relative path and an absolute URL are judged
 * by the URL Next would print in the <link>, not by how they are written.
 * What this cannot see is the rendered HTML; Next prints one
 * <link rel="canonical"> for the one `alternates.canonical` it resolves.
 */
describe('canonical links', () => {
  const layout = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8')

  test('the root layout sets metadataBase to the apex and no canonical', () => {
    expect(layout).toContain(`metadataBase: new URL('https://matttrifilo.com')`)
    // A canonical here would be inherited by every page without its own,
    // the 404 included.
    expect(layout).not.toContain('canonical')
  })

  test('every page declares one canonical, its own path on the apex', async () => {
    // With the assistant switched off, /ask and /ask/evals 404 and carry no
    // canonical; this checks the pages as they are when it is on.
    const saved = process.env.CHAT_DISABLED
    delete process.env.CHAT_DISABLED
    let pages: PageMetadata[]
    try {
      pages = await pageMetadata()
    } finally {
      if (saved !== undefined) process.env.CHAT_DISABLED = saved
    }
    expect(pages.map(p => p.page)).toEqual(pageFiles())

    const config = (await import('../../next.config')).default
    const context = {
      trailingSlash: Boolean(config.trailingSlash),
      isStaticMetadataRouteFile: false,
    }
    for (const { page, metadata, params } of pages) {
      const path = routePath(page, params)
      const canonical = metadata.alternates?.canonical
      expect(`${page}: ${typeof canonical}`).toBe(`${page}: string`)
      const resolved = await resolveAlternates(
        metadata.alternates,
        new URL('https://matttrifilo.com'),
        Promise.resolve(path),
        context
      )
      // Next prints the site root as the bare origin.
      const expected = `https://matttrifilo.com${path === '/' ? '' : path}`
      expect(`${page}: ${resolved?.canonical?.url}`).toBe(
        `${page}: ${expected}`
      )
    }
  })

  test('no page or component writes a canonical link of its own', () => {
    const sources = ['app', 'components'].flatMap(dir =>
      readdirSync(join(ROOT, dir), { recursive: true })
        .map(String)
        .filter(file => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
        .map(file => join(ROOT, dir, file))
    )
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      expect(`${file}: ${/rel=\{?["']canonical["']/.test(text)}`).toBe(
        `${file}: false`
      )
    }
  })
})
