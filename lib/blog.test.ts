import { afterAll, describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getAllBlogPosts,
  getBlogPost,
  parseFrontmatterDate,
  rawFrontmatterBlock,
} from './blog'

/** The raw frontmatter block as getBlogPost slices it from a post file. */
const raw = (yaml: string) =>
  rawFrontmatterBlock(`---\n${yaml}\n---\n\nBody text.\n`)

describe('rawFrontmatterBlock', () => {
  test('returns the text between the fences', () => {
    expect(raw('title: t\ndate: 2026-03-01')).toBe('title: t\ndate: 2026-03-01')
  })
  test('handles CRLF fences', () => {
    expect(rawFrontmatterBlock('---\r\ndate: 2026-03-01\r\n---\r\nBody')).toBe(
      'date: 2026-03-01'
    )
  })
  test('returns empty when there is no frontmatter', () => {
    expect(rawFrontmatterBlock('Just a body.')).toBe('')
  })
  test('tolerates a BOM and trailing whitespace on the opening fence', () => {
    expect(rawFrontmatterBlock('\uFEFF---\ndate: 2026-03-01\n---\nBody')).toBe(
      'date: 2026-03-01'
    )
    expect(rawFrontmatterBlock('--- \t\ndate: 2026-03-01\n---\nBody')).toBe(
      'date: 2026-03-01'
    )
  })
})

describe('parseFrontmatterDate', () => {
  test('accepts a quoted plain date', () => {
    expect(parseFrontmatterDate(raw("date: '2026-03-01'"), 'x.md')).toBe(
      '2026-03-01'
    )
    expect(parseFrontmatterDate(raw('date: "2026-03-01"'), 'x.md')).toBe(
      '2026-03-01'
    )
  })

  test('accepts an unquoted plain date (which YAML would otherwise turn into a Date)', () => {
    expect(
      parseFrontmatterDate(
        raw('title: t\ndate: 2026-03-01\ndescription: d'),
        'x.md'
      )
    ).toBe('2026-03-01')
  })

  test('rejects timestamps, including one that lands exactly on UTC midnight', () => {
    expect(() =>
      parseFrontmatterDate(raw('date: 2026-03-01 18:00:00 -07:00'), 'x.md')
    ).toThrow(/x\.md/)
    // 17:00 in Phoenix is 00:00 UTC the next day; a Date-based check let this through.
    expect(() =>
      parseFrontmatterDate(raw('date: 2026-03-01 17:00:00 -07:00'), 'x.md')
    ).toThrow(/x\.md/)
    expect(() =>
      parseFrontmatterDate(raw('date: 2026-03-01T00:00:00Z'), 'x.md')
    ).toThrow(/x\.md/)
  })

  test('rejects dates that are not real calendar dates', () => {
    expect(() => parseFrontmatterDate(raw('date: 2026-02-30'), 'x.md')).toThrow(
      /not a real calendar date/
    )
    expect(() =>
      parseFrontmatterDate(raw("date: '2026-13-45'"), 'x.md')
    ).toThrow(/not a real calendar date/)
    expect(() =>
      parseFrontmatterDate(raw("date: '2026-31-01'"), 'x.md')
    ).toThrow(/not a real calendar date/)
  })

  test('distinguishes a missing block from a missing date line', () => {
    expect(() => parseFrontmatterDate('', 'x.md')).toThrow(
      /no frontmatter block/
    )
    expect(() => parseFrontmatterDate(raw('title: x'), 'x.md')).toThrow(
      /needs a plain "date: YYYY-MM-DD"/
    )
  })

  test('rejects a missing or malformed date', () => {
    expect(() => parseFrontmatterDate(raw('title: x'), 'x.md')).toThrow(/x\.md/)
    expect(() =>
      parseFrontmatterDate(raw("date: 'March 1, 2026'"), 'x.md')
    ).toThrow(/x\.md/)
  })
})

const FIXTURES = path.join(process.cwd(), 'test', 'fixtures', 'blog')

describe('the loader on fixture posts', () => {
  test('a post with a bad date fails the loader with its file name', () => {
    // getAllBlogPosts is what the blog index and home page call during
    // `next build`, so a throw here is a failed build, not a missing post.
    expect(() => getAllBlogPosts(path.join(FIXTURES, 'malformed'))).toThrow(
      'test/fixtures/blog/malformed/2026-02-30-bad-date.md: frontmatter date is not a real calendar date (got 2026-02-30)'
    )
  })

  test('a valid post loads, and underscore and non-Markdown files stay ignored', () => {
    const posts = getAllBlogPosts(path.join(FIXTURES, 'valid'))
    expect(posts.map(post => post.slug)).toEqual(['2026-03-01-a-valid-post'])
  })

  test('the frontmatter carries only the typed fields, dates as written', () => {
    const post = getBlogPost(
      '2026-03-01-a-valid-post',
      path.join(FIXTURES, 'valid')
    )
    // Unquoted dates would parse as Date objects; both come from the raw
    // lines as the strings the author wrote. `notes` is not a field the
    // site reads, so it does not reach the page.
    expect(post?.frontmatter).toEqual({
      title: 'A valid post, with "quotes"',
      date: '2026-03-01',
      updated: '2026-03-15',
      description: 'A description: with a colon.',
      categories: ['engineering', '2026'],
    })
  })

  test('the posts the site publishes all pass the guard', () => {
    // CI's `next build` is the real proof; this fails `bun test` first.
    expect(getAllBlogPosts().length).toBeGreaterThan(0)
  })
})

describe('the frontmatter guard', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-guard-'))
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  /** Writes a post with this frontmatter and loads it through getBlogPost. */
  const load = (name: string, yaml: string) => {
    fs.writeFileSync(
      path.join(dir, `${name}.md`),
      `---\n${yaml}\n---\n\nBody.\n`
    )
    return () => getBlogPost(name, dir)
  }

  test('a YAML error names the file, on every read', () => {
    const read = load('yaml-error', 'title: "unclosed\ndate: 2026-03-01')
    expect(read).toThrow(/yaml-error\.md: frontmatter is not valid YAML/)
    // Called without options, gray-matter's cache hands back empty data
    // on the second read of a file whose YAML failed.
    expect(read).toThrow(/yaml-error\.md: frontmatter is not valid YAML/)
  })

  test('a description with unescaped quotes is a YAML error, not a lost post', () => {
    expect(
      load('quotes', 'title: t\ndate: 2026-03-01\ndescription: "a "b" c"')
    ).toThrow(/quotes\.md: frontmatter is not valid YAML/)
  })

  test('a missing, empty, or non-text title is refused', () => {
    expect(load('no-title', 'date: 2026-03-01')).toThrow(
      /no-title\.md: frontmatter needs a title, as text \(got nothing\)/
    )
    expect(load('blank-title', "title: '  '\ndate: 2026-03-01")).toThrow(
      /blank-title\.md: frontmatter needs a title/
    )
    expect(load('number-title', 'title: 42\ndate: 2026-03-01')).toThrow(
      /number-title\.md: frontmatter needs a title, as text \(got the number 42\)/
    )
  })

  test('a written description must be text', () => {
    expect(
      load('list-description', 'title: t\ndate: 2026-03-01\ndescription: [a]')
    ).toThrow(/list-description\.md: frontmatter description must be text/)
    expect(
      load('empty-description', 'title: t\ndate: 2026-03-01\ndescription:')
    ).toThrow(/empty-description\.md: .*\(got nothing\)/)
    expect(
      load('blank-description', "title: t\ndate: 2026-03-01\ndescription: '  '")
    ).toThrow(/blank-description\.md: frontmatter description must be text/)
  })

  test('categories must be a list of text values', () => {
    expect(
      load('string-categories', 'title: t\ndate: 2026-03-01\ncategories: a')
    ).toThrow(/string-categories\.md: frontmatter categories must be a list/)
    expect(
      load(
        'number-category',
        'title: t\ndate: 2026-03-01\ncategories:\n  - engineering\n  - 2026'
      )
    ).toThrow(/number-category\.md: each category must be text/)
    expect(
      load('bool-category', 'title: t\ndate: 2026-03-01\ncategories: [true]')
    ).toThrow(/bool-category\.md: each category must be text/)
  })

  test('updated follows the date rule', () => {
    expect(
      load('bad-updated', 'title: t\ndate: 2026-03-01\nupdated: 2026-02-30')
    ).toThrow(
      /bad-updated\.md: frontmatter updated is not a real calendar date/
    )
    expect(
      load(
        'timestamp-updated',
        'title: t\ndate: 2026-03-01\nupdated: 2026-03-02T10:00:00Z'
      )
    ).toThrow(/timestamp-updated\.md: .*"updated: YYYY-MM-DD" line/)
  })

  test('frontmatter written as a list, not key: value lines, is refused', () => {
    expect(load('list-frontmatter', '- date: 2026-03-01')).toThrow(
      /list-frontmatter\.md: frontmatter/
    )
  })
})
