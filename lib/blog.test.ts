import { describe, expect, test } from 'bun:test'
import { parseFrontmatterDate, rawFrontmatterBlock } from './blog'

/** The raw frontmatter block as getBlogPost slices it from a post file. */
const raw = (yaml: string) => rawFrontmatterBlock(`---\n${yaml}\n---\n\nBody text.\n`)

describe('rawFrontmatterBlock', () => {
  test('returns the text between the fences', () => {
    expect(raw('title: t\ndate: 2026-03-01')).toBe('title: t\ndate: 2026-03-01')
  })
  test('handles CRLF fences', () => {
    expect(rawFrontmatterBlock('---\r\ndate: 2026-03-01\r\n---\r\nBody')).toBe('date: 2026-03-01')
  })
  test('returns empty when there is no frontmatter', () => {
    expect(rawFrontmatterBlock('Just a body.')).toBe('')
  })
})

describe('parseFrontmatterDate', () => {
  test('accepts a quoted plain date', () => {
    expect(parseFrontmatterDate(raw("date: '2026-03-01'"), 'x.md')).toBe('2026-03-01')
    expect(parseFrontmatterDate(raw('date: "2026-03-01"'), 'x.md')).toBe('2026-03-01')
  })

  test('accepts an unquoted plain date (which YAML would otherwise turn into a Date)', () => {
    expect(parseFrontmatterDate(raw('title: t\ndate: 2026-03-01\ndescription: d'), 'x.md')).toBe('2026-03-01')
  })

  test('rejects timestamps, including one that lands exactly on UTC midnight', () => {
    expect(() => parseFrontmatterDate(raw('date: 2026-03-01 18:00:00 -07:00'), 'x.md')).toThrow(/x\.md/)
    // 17:00 in Phoenix is 00:00 UTC the next day; a Date-based check let this through.
    expect(() => parseFrontmatterDate(raw('date: 2026-03-01 17:00:00 -07:00'), 'x.md')).toThrow(/x\.md/)
    expect(() => parseFrontmatterDate(raw('date: 2026-03-01T00:00:00Z'), 'x.md')).toThrow(/x\.md/)
  })

  test('rejects dates that are not real calendar dates', () => {
    expect(() => parseFrontmatterDate(raw('date: 2026-02-30'), 'x.md')).toThrow(/not a real calendar date/)
    expect(() => parseFrontmatterDate(raw("date: '2026-13-45'"), 'x.md')).toThrow(/not a real calendar date/)
    expect(() => parseFrontmatterDate(raw("date: '2026-31-01'"), 'x.md')).toThrow(/not a real calendar date/)
  })

  test('rejects a missing or malformed date', () => {
    expect(() => parseFrontmatterDate(raw('title: x'), 'x.md')).toThrow(/x\.md/)
    expect(() => parseFrontmatterDate(raw("date: 'March 1, 2026'"), 'x.md')).toThrow(/x\.md/)
  })
})
