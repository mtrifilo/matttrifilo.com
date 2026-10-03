import { describe, expect, test } from 'bun:test'
import path from 'path'
import { getBlogPost } from './blog'

/**
 * The excerpt is the page's meta and Open Graph description whenever a post
 * has no `description`, so it has to be plain text a search result can show.
 * extractExcerpt is private; these read it the way the pages do, through
 * getBlogPost on fixture posts.
 */
const EXCERPT_FIXTURES = path.join(
  process.cwd(),
  'test',
  'fixtures',
  'blog',
  'excerpt'
)

function excerptOf(slug: string): string {
  const post = getBlogPost(slug, EXCERPT_FIXTURES)
  if (!post) throw new Error(`fixture ${slug}.md is missing`)
  return post.excerpt
}

describe('the excerpt strips Markdown to plain text', () => {
  test('keeps link and heading text; drops URLs, markup characters and a self-closing component; joins lines', () => {
    // markup.md also holds `<Figure src="..." alt="A figure" />` between
    // its paragraphs, so no attribute text may appear here.
    expect(excerptOf('markup')).toBe(
      'A heading Some bold, some italic, and inline code with a link to a page. A second paragraph that wraps onto a second line.'
    )
  })

  test('a code fence loses its backticks but keeps its language tag and its code', () => {
    expect(excerptOf('code-fence')).toBe(
      'Setup ts const answer = 42 After the fence.'
    )
  })
})

describe('the excerpt is cut at 200 characters', () => {
  test('a body of exactly 200 characters is returned whole, with no dots', () => {
    const excerpt = excerptOf('exactly-200')
    expect(excerpt.length).toBe(200)
    expect(excerpt.endsWith('three dots.')).toBe(true)
  })

  test('a longer body keeps its first 200 characters, cut mid-word, and gains three ASCII dots', () => {
    expect(excerptOf('over-200')).toBe(
      'This body runs past two hundred characters, so the loader keeps the first two hundred, trims any space left at the end, and adds three dots. Here the two hundredth character falls in the middle of a l...'
    )
  })

  test('a space at the cut is trimmed before the dots, so the excerpt is one shorter', () => {
    const excerpt = excerptOf('space-at-cut')
    expect(excerpt.length).toBe(202)
    expect(excerpt.endsWith(' the shorter...')).toBe(true)
  })

  test('the length is measured after stripping, so a long URL does not trigger the cut', () => {
    // The raw line is well over 200 characters; the text a reader sees is not.
    expect(excerptOf('long-link')).toBe('A short sentence with one link in it.')
  })
})

describe('a post with no prose', () => {
  test('an empty body gives an empty excerpt', () => {
    expect(excerptOf('empty-body')).toBe('')
  })

  test('a body of only self-closing components gives an empty excerpt', () => {
    expect(excerptOf('component-only')).toBe('')
  })
})
