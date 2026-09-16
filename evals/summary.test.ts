import { describe, expect, test } from 'bun:test'
import {
  UNLABELLED_SUITE,
  allPassed,
  markdownTable,
  summarise,
  type ResultsFile,
} from './summary'

const row = (
  suite: string | undefined,
  success: boolean,
  model = 'gemini-x'
) => ({
  success,
  testCase: { metadata: suite === undefined ? {} : { suite } },
  metadata: { model },
})

const file = (rows: ReturnType<typeof row>[]): ResultsFile => ({
  results: { results: rows },
})

describe('summarise', () => {
  test('counts passes per suite and in total', () => {
    const summary = summarise({
      results: file([
        row('golden', true),
        row('golden', false),
        row('refusals', true),
      ]),
      commit: 'abc1234def',
      ranAt: '2026-09-16T00:00:00.000Z',
    })

    expect(summary.suites).toEqual([
      { name: 'golden', passed: 1, total: 2 },
      { name: 'refusals', passed: 1, total: 1 },
    ])
    expect(summary.totals).toEqual({ passed: 2, total: 3 })
    expect(summary.commit).toBe('abc1234def')
    expect(summary.ranAt).toBe('2026-09-16T00:00:00.000Z')
  })

  test('takes the model from the provider when the caller gives none', () => {
    const summary = summarise({
      results: file([row('golden', true, 'gemini-3.8-flash')]),
      commit: 'c',
      ranAt: 'r',
    })
    expect(summary.model).toBe('gemini-3.8-flash')
  })

  test('an explicit model wins', () => {
    const summary = summarise({
      results: file([row('golden', true, 'from-provider')]),
      commit: 'c',
      ranAt: 'r',
      model: 'explicit',
    })
    expect(summary.model).toBe('explicit')
  })

  test('a row with no suite is counted, not dropped', () => {
    const summary = summarise({
      results: file([row(undefined, false)]),
      commit: 'c',
      ranAt: 'r',
    })
    expect(summary.suites).toEqual([
      { name: UNLABELLED_SUITE, passed: 0, total: 1 },
    ])
    expect(summary.totals.total).toBe(1)
  })

  test('counts the tests that were sent a second time', () => {
    const retried = {
      ...row('golden', true),
      metadata: { model: 'gemini-x', attempt: 2 },
    }
    const third = {
      ...row('golden', true),
      metadata: { model: 'gemini-x', attempt: 3 },
    }
    const summary = summarise({
      results: file([row('golden', true), retried, retried, third]),
      commit: 'c',
      ranAt: 'r',
    })
    expect(summary.retried).toBe(3)
  })

  test('an empty run reports nothing rather than throwing', () => {
    const summary = summarise({ results: {}, commit: 'c', ranAt: 'r' })
    expect(summary.suites).toEqual([])
    expect(summary.totals).toEqual({ passed: 0, total: 0 })
    expect(summary.model).toBe('unknown')
  })
})

describe('allPassed', () => {
  test('true only when every test passed', () => {
    const base = { commit: 'c', ranAt: 'r', model: 'm', retried: 0 }
    expect(
      allPassed({ ...base, suites: [], totals: { passed: 3, total: 3 } })
    ).toBe(true)
    expect(
      allPassed({ ...base, suites: [], totals: { passed: 2, total: 3 } })
    ).toBe(false)
  })

  test('a run with no tests is not a pass', () => {
    expect(
      allPassed({
        commit: 'c',
        ranAt: 'r',
        model: 'm',
        suites: [],
        totals: { passed: 0, total: 0 },
        retried: 0,
      })
    ).toBe(false)
  })
})

describe('markdownTable', () => {
  test('renders a row per suite and a total', () => {
    const table = markdownTable({
      commit: 'abc1234def',
      ranAt: '2026-09-16T00:00:00.000Z',
      model: 'gemini-3.8-flash',
      suites: [{ name: 'golden', passed: 31, total: 32 }],
      totals: { passed: 31, total: 32 },
      retried: 2,
    })

    expect(table).toContain('| golden | 31 | 32 |')
    expect(table).toContain('| **total** | **31** | **32** |')
    expect(table).toContain('abc1234')
    expect(table).toContain('gemini-3.8-flash')
  })
})
