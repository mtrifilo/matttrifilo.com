import { describe, expect, test } from 'bun:test'
import { formatDate, formatMonthYear } from './format-date'

describe('formatDate', () => {
  test('renders the calendar date the author wrote, regardless of process timezone', () => {
    // CI runs this with TZ=America/Phoenix; without the UTC pin this
    // would render "February 28, 2026".
    expect(formatDate('2026-03-01')).toBe('March 1, 2026')
  })

  test('handles the last day of a year', () => {
    expect(formatDate('2025-12-31')).toBe('December 31, 2025')
  })
})

describe('formatMonthYear', () => {
  test('is timezone-stable', () => {
    // 00:30 UTC on March 1 is still February 28 in Phoenix.
    expect(formatMonthYear('2026-03-01T00:30:00Z')).toBe('March 2026')
  })
})
