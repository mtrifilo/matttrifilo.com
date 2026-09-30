import { describe, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { dynamic, GET } from '@/app/feed.xml/route'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { getAllBlogPosts } from '@/lib/blog'
import {
  escapeXml,
  FEED_PATH,
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
  test('is noon UTC on the written date, whatever the process time zone', () => {
    // CI runs this file with TZ=America/Phoenix as well as without.
    expect(rfc822Date('2026-03-01')).toBe('Sun, 01 Mar 2026 12:00:00 GMT')
    expect(rfc822Date('2025-12-31')).toBe('Wed, 31 Dec 2025 12:00:00 GMT')
  })

  test('shows the written date to a reader in the Americas, Europe and Asia', () => {
    const instant = new Date(rfc822Date('2026-03-01'))
    for (const timeZone of [
      'Pacific/Honolulu',
      'America/Phoenix',
      'America/Chicago',
      'UTC',
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
