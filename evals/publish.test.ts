import { describe, expect, test } from 'bun:test'
import { planPublish, publishedCommit, resultFileName } from './publish'
import type { EvalSummary } from './summary'

/**
 * What `evals:publish` decides before anything is committed: which commit
 * the record names, what it is called, and what it refuses. The record it
 * writes is committed to a public repository, so what goes into it is
 * pinned here rather than left to a spread.
 */

const CI_SHA = '6406ee4d4afe1da0290d23a1f0afa3bf6e225902'
const HEAD_SHA = '1f2e3d4c5b6a7980112233445566778899aabbcc'

const summary = (over: Partial<EvalSummary> = {}): EvalSummary => ({
  commit: CI_SHA,
  ranAt: '2026-09-21T16:59:31.433Z',
  model: 'gemini-3.8-flash',
  promptfooVersion: '0.123.0',
  suites: [{ name: 'golden', passed: 3, total: 4 }],
  totals: { passed: 3, total: 4 },
  retried: 0,
  ...over,
})

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

describe('planPublish', () => {
  test('publishes the fields the page shows, and only those', () => {
    const decision = planPublish(
      { ...summary(), rationale: 'a grader explaining itself' },
      null
    )
    expect(decision).toEqual({
      file: '2026-09-21-6406ee4.json',
      record: {
        commit: CI_SHA,
        ranAt: '2026-09-21T16:59:31.433Z',
        model: 'gemini-3.8-flash',
        promptfooVersion: '0.123.0',
        suites: [{ name: 'golden', passed: 3, total: 4 }],
        totals: { passed: 3, total: 4 },
        retried: 0,
      },
    })
  })

  test('leaves out a promptfoo version the run did not record', () => {
    const older = summary()
    delete older.promptfooVersion
    const decision = planPublish(older, null)
    expect(decision).not.toHaveProperty('refusal')
    expect(
      Object.keys('record' in decision ? decision.record : {})
    ).not.toContain('promptfooVersion')
  })

  test('refuses a summary with no totals', () => {
    const broken = summary() as unknown as Record<string, unknown>
    delete broken.totals
    expect(planPublish(broken, HEAD_SHA)).toEqual({
      refusal: expect.stringContaining('totals'),
    })
  })

  test('refuses a summary whose suites disagree with its totals', () => {
    expect(
      planPublish(summary({ totals: { passed: 3, total: 9 } }), HEAD_SHA)
    ).toEqual({ refusal: expect.stringContaining('suite counts') })
  })

  test('refuses when no commit can be named', () => {
    expect(planPublish(summary({ commit: 'local' }), null)).toEqual({
      refusal: expect.stringContaining('name no commit'),
    })
  })

  test('names HEAD when the run recorded no commit of its own', () => {
    const decision = planPublish(summary({ commit: 'local' }), HEAD_SHA)
    expect(decision).toMatchObject({
      file: '2026-09-21-1f2e3d4.json',
      record: { commit: HEAD_SHA },
    })
  })
})
