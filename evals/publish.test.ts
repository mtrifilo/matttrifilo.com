import { describe, expect, test } from 'bun:test'
import { publishedCommit, resultFileName } from './publish'

/**
 * The two decisions `evals:publish` makes about a record before it is
 * committed: which commit it names, and what it is called. Both are read by
 * a person in a directory listing and by lib/evals/results at build time.
 */

const CI_SHA = '6406ee4d4afe1da0290d23a1f0afa3bf6e225902'
const HEAD_SHA = '1f2e3d4c5b6a7980112233445566778899aabbcc'

describe('publishedCommit', () => {
  test('keeps the commit the run recorded', () => {
    expect(publishedCommit(CI_SHA, HEAD_SHA)).toBe(CI_SHA)
  })

  test('stands HEAD in when the run recorded no commit', () => {
    // A local run has no GITHUB_SHA and records `local`; HEAD is the commit
    // the record is about to be attached to.
    expect(publishedCommit('local', HEAD_SHA)).toBe(HEAD_SHA)
  })

  test('names no commit when neither is a git object name', () => {
    expect(publishedCommit('local', null)).toBe(null)
    expect(publishedCommit('local', 'not-a-sha')).toBe(null)
  })
})

describe('resultFileName', () => {
  test('is the run date in UTC and the seven-character commit', () => {
    expect(resultFileName('2026-09-21T16:59:31.433Z', CI_SHA)).toBe(
      '2026-09-21-6406ee4.json'
    )
  })

  test('dates the file by when the run happened, not by when it is published', () => {
    expect(resultFileName('2026-08-01T23:59:59.000Z', HEAD_SHA)).toBe(
      '2026-08-01-1f2e3d4.json'
    )
  })
})
