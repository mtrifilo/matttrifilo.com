/**
 * Formats a `YYYY-MM-DD` frontmatter date for display.
 *
 * `new Date('2026-03-01')` parses as UTC midnight, so formatting in a
 * timezone west of UTC would render February 28. Pinning the output
 * timezone to UTC keeps the calendar date the author wrote.
 */
export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** "March 2026" from an ISO timestamp, in UTC so the month never shifts. */
export function formatMonthYear(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
