import { describe, expect, test } from 'bun:test'
import matter from 'gray-matter'
import { normalizeFrontmatterDate } from './blog'

const parse = (yaml: string) => matter(`---\n${yaml}\n---\n`).data.date

describe('normalizeFrontmatterDate', () => {
  test('keeps a quoted YYYY-MM-DD string', () => {
    expect(normalizeFrontmatterDate(parse("date: '2026-03-01'"), 'x.md')).toBe('2026-03-01')
  })

  test('converts an unquoted date (parsed by YAML as a Date) back to YYYY-MM-DD', () => {
    const value = parse('date: 2026-03-01')
    expect(value).toBeInstanceOf(Date)
    expect(normalizeFrontmatterDate(value, 'x.md')).toBe('2026-03-01')
  })

  test('rejects a timestamp with an offset instead of shifting the day', () => {
    expect(() => normalizeFrontmatterDate(parse('date: 2026-03-01 18:00:00 -07:00'), 'x.md')).toThrow(
      /x\.md: frontmatter date must be a plain YYYY-MM-DD/
    )
  })

  test('rejects a missing date', () => {
    expect(() => normalizeFrontmatterDate(parse('title: x'), 'x.md')).toThrow(/x\.md/)
  })

  test('rejects a malformed string', () => {
    expect(() => normalizeFrontmatterDate('March 1, 2026', 'x.md')).toThrow(/x\.md/)
  })
})
