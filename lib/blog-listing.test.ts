import { describe, expect, test } from 'bun:test'
import path from 'path'
import { getAllBlogPosts, getBlogSlugs } from './blog'

/**
 * listing/ holds four posts on three dates, two of them on the same day,
 * with file names whose alphabetical order is neither newest first nor
 * oldest first. Beside them sit `_draft.md`, valid and dated after every
 * post, and `notes.txt`.
 */
const LISTING_FIXTURES = path.join(
  process.cwd(),
  'test',
  'fixtures',
  'blog',
  'listing'
)

describe('getBlogSlugs', () => {
  test('lists only Markdown files without a leading underscore, without the extension', () => {
    // The sitemap and the post routes' static params read this list
    // directly, so a stray entry here becomes a sitemap link to a post page
    // that calls notFound(), even though getAllBlogPosts would skip it.
    expect(getBlogSlugs(LISTING_FIXTURES).sort()).toEqual([
      'a-spring',
      'b-winter',
      'c-summer',
      'd-spring-again',
    ])
  })
})

describe('getAllBlogPosts ordering', () => {
  const posts = getAllBlogPosts(LISTING_FIXTURES)

  test('lists newest first, and leaves the draft out even though it is the newest', () => {
    const slugs = posts.map(post => post.slug)
    expect(slugs[0]).toBe('c-summer')
    expect(slugs.at(-1)).toBe('b-winter')
    expect(slugs).not.toContain('_draft')
    expect(posts.map(post => post.date)).toEqual([
      '2026-05-02',
      '2026-03-10',
      '2026-03-10',
      '2026-01-15',
    ])
  })

  test('posts on the same date keep the order getBlogSlugs read them in', () => {
    // The comparator looks only at the date and Array.prototype.sort is
    // stable, so a tie falls back to directory order, whatever the file
    // system returns; this pins that no other tiebreak is applied.
    const sameDay = (slugs: string[]) =>
      slugs.filter(slug => slug === 'a-spring' || slug === 'd-spring-again')
    expect(sameDay(posts.map(post => post.slug))).toEqual(
      sameDay(getBlogSlugs(LISTING_FIXTURES))
    )
  })
})

describe('getAllBlogPosts entries', () => {
  const bySlug = new Map(
    getAllBlogPosts(LISTING_FIXTURES).map(post => [post.slug, post])
  )

  test('carry the frontmatter fields the listing shows, and the excerpt', () => {
    const winter = bySlug.get('b-winter')
    expect(winter?.title).toBe('Winter')
    expect(winter?.date).toBe('2026-01-15')
    expect(winter?.categories).toEqual(['engineering'])
    expect(winter?.description).toBeUndefined()
    expect(winter?.excerpt).toBe('The oldest post in the listing.')

    expect(bySlug.get('a-spring')?.description).toBe(
      'Written in March, alongside another post from the same day.'
    )
  })

  test('a post with no categories lists an empty array, not undefined', () => {
    expect(bySlug.get('c-summer')?.categories).toEqual([])
  })
})
