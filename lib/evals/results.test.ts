import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { EvalSummary } from '@/evals/summary'
import {
  evalHistory,
  hasPublishedEvalRun,
  isCommitSha,
  isEvalSummary,
  latestEvalSummary,
  readEvalRuns,
  shortCommit,
} from './results'

/**
 * The published eval records are read from disk at build time and every
 * field of them is rendered, so what these tests pin is the boundary: what
 * counts as a record, what a bad file does to the rest of the history, and
 * that the newest run is the one the page leads with.
 */

const run = (over: Partial<EvalSummary> = {}): EvalSummary => ({
  commit: '6406ee4d4afe1da0290d23a1f0afa3bf6e225902',
  ranAt: '2026-09-21T16:59:31.433Z',
  model: 'gemini-3.8-flash',
  promptfooVersion: '0.123.0',
  suites: [
    { name: 'golden', passed: 67, total: 74 },
    { name: 'refusals', passed: 24, total: 24 },
  ],
  totals: { passed: 91, total: 98 },
  retried: 5,
  ...over,
})

const dirs: string[] = []

/** A results directory holding the given files, cleaned up afterwards. */
function resultsDir(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-results-'))
  dirs.push(dir)
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(dir, name),
      typeof contents === 'string' ? contents : JSON.stringify(contents)
    )
  }
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('isEvalSummary', () => {
  test('accepts a summary the way summarise writes one', () => {
    expect(isEvalSummary(run())).toBe(true)
  })

  test('accepts a run with no suites at all', () => {
    // A run that walked no tests is a real, and honest, record: zero of zero.
    expect(
      isEvalSummary(run({ suites: [], totals: { passed: 0, total: 0 } }))
    ).toBe(true)
  })

  test('rejects anything that is not an object', () => {
    for (const value of [null, undefined, 'summary', 7, []])
      expect(isEvalSummary(value)).toBe(false)
  })

  test('rejects a record missing any field the page renders', () => {
    for (const field of [
      'commit',
      'ranAt',
      'model',
      'suites',
      'totals',
      'retried',
    ]) {
      const partial = run() as unknown as Record<string, unknown>
      delete partial[field]
      expect(isEvalSummary(partial)).toBe(false)
    }
  })

  test('accepts a record from before the promptfoo version was recorded', () => {
    const older = run() as unknown as Record<string, unknown>
    delete older.promptfooVersion
    expect(isEvalSummary(older)).toBe(true)
  })

  test('rejects totals that are not whole, countable numbers', () => {
    expect(
      isEvalSummary(run({ suites: [], totals: { passed: 1.5, total: 2 } }))
    ).toBe(false)
    expect(
      isEvalSummary(run({ suites: [], totals: { passed: -1, total: 2 } }))
    ).toBe(false)
    expect(
      isEvalSummary(
        run({ suites: [], totals: { passed: '136', total: 144 } as never })
      )
    ).toBe(false)
  })

  test('rejects more passes than tests, in the totals and in a suite', () => {
    // The page reads the two as a fraction; "153 of 144" is not a state a
    // visitor can interpret.
    expect(
      isEvalSummary(run({ suites: [], totals: { passed: 153, total: 144 } }))
    ).toBe(false)
    expect(
      isEvalSummary(run({ suites: [{ name: 'golden', passed: 9, total: 4 }] }))
    ).toBe(false)
  })

  test('rejects suite rows that do not add up to the totals row', () => {
    // A table whose rows contradict its own total is not something a
    // visitor can read, and no run produces one: summarise sums the suites.
    expect(
      isEvalSummary(
        run({
          suites: [{ name: 'golden', passed: 1000, total: 1000 }],
          totals: { passed: 0, total: 0 },
        })
      )
    ).toBe(false)
    expect(
      isEvalSummary(
        run({
          suites: [{ name: 'golden', passed: 4, total: 5 }],
          totals: { passed: 4, total: 6 },
        })
      )
    ).toBe(false)
  })

  test('rejects a suite with no usable name', () => {
    expect(
      isEvalSummary(
        run({
          suites: [{ name: '', passed: 1, total: 1 }],
          totals: { passed: 1, total: 1 },
        })
      )
    ).toBe(false)
    expect(
      isEvalSummary(
        run({
          suites: [{ passed: 1, total: 1 } as never],
          totals: { passed: 1, total: 1 },
        })
      )
    ).toBe(false)
  })

  test('rejects text the page cannot put in front of a visitor as it stands', () => {
    // A bidirectional override rearranges the text around it and React
    // escapes markup, not formatting characters. Length is bounded for the
    // same reason: these are labels in a table, not prose.
    expect(isEvalSummary(run({ model: 'gemini‮3.8' }))).toBe(false)
    expect(isEvalSummary(run({ model: 'a'.repeat(65) }))).toBe(false)
    expect(isEvalSummary(run({ commit: 'local\n' }))).toBe(false)
    expect(
      isEvalSummary(
        run({
          suites: [{ name: 'gold\u0007en', passed: 1, total: 1 }],
          totals: { passed: 1, total: 1 },
        })
      )
    ).toBe(false)
    expect(isEvalSummary(run({ promptfooVersion: '0.123.0‮' }))).toBe(false)
  })

  test('rejects a ranAt the history cannot be sorted by', () => {
    for (const ranAt of ['', 'yesterday', '2026-09-21', '2026-13-99T00:00:00Z'])
      expect(isEvalSummary(run({ ranAt }))).toBe(false)
  })

  test('rejects a ranAt that is not UTC', () => {
    // The file name is the first ten characters of this string and the page
    // formats it in UTC, so an offset would date one record three ways.
    expect(isEvalSummary(run({ ranAt: '2026-09-21T23:00:00-07:00' }))).toBe(
      false
    )
    expect(isEvalSummary(run({ ranAt: '2026-09-21T16:59:31.433' }))).toBe(false)
  })
})

describe('isCommitSha', () => {
  test('recognises a git object name, short or full', () => {
    expect(isCommitSha('6406ee4')).toBe(true)
    expect(isCommitSha('6406ee4d4afe1da0290d23a1f0afa3bf6e225902')).toBe(true)
  })

  test('rejects what a run with no commit records', () => {
    // `local` is what evals/summarize.ts writes without a GITHUB_SHA. It is
    // a fact about the run, not something to link to a commit page.
    expect(isCommitSha('local')).toBe(false)
    expect(isCommitSha('')).toBe(false)
    expect(isCommitSha('6406EE4')).toBe(false)
    expect(isCommitSha('6406ee')).toBe(false)
  })

  test('shortCommit is the seven characters a commit is read by', () => {
    expect(shortCommit('6406ee4d4afe1da0290d23a1f0afa3bf6e225902')).toBe(
      '6406ee4'
    )
  })
})

describe('readEvalRuns', () => {
  test('is empty when nothing has been published', () => {
    const dir = resultsDir({})
    expect(readEvalRuns(dir)).toEqual([])
    expect(latestEvalSummary(dir)).toBe(null)
    expect(hasPublishedEvalRun(dir)).toBe(false)
    expect(evalHistory(10, dir)).toEqual([])
  })

  test('is empty, rather than a crash, when the directory is not there', () => {
    const dir = path.join(resultsDir({}), 'never-published')
    expect(readEvalRuns(dir)).toEqual([])
    expect(hasPublishedEvalRun(dir)).toBe(false)
  })

  test('returns the runs newest first, whatever the file names sort like', () => {
    const dir = resultsDir({
      'b-older.json': run({ ranAt: '2026-08-01T10:00:00.000Z' }),
      'a-newer.json': run({ ranAt: '2026-09-21T16:59:31.433Z' }),
      'c-middle.json': run({ ranAt: '2026-09-01T10:00:00.000Z' }),
    })
    expect(readEvalRuns(dir).map(record => record.file)).toEqual([
      'a-newer.json',
      'c-middle.json',
      'b-older.json',
    ])
    expect(latestEvalSummary(dir)?.file).toBe('a-newer.json')
  })

  test('keeps the record and names the file it came from', () => {
    const dir = resultsDir({ '2026-09-21-6406ee4.json': run() })
    const [record] = readEvalRuns(dir)
    expect(record).toMatchObject(run())
    expect(record.file).toBe('2026-09-21-6406ee4.json')
    expect(hasPublishedEvalRun(dir)).toBe(true)
  })

  test('skips a malformed file and still publishes the rest', () => {
    // One unreadable record must not take the build, or the history, down.
    const dir = resultsDir({
      'good.json': run({ ranAt: '2026-09-21T16:59:31.433Z' }),
      'not-json.json': '{ this is not json',
      'not-a-summary.json': {
        commit: 'abc1234',
        ranAt: '2026-09-20T00:00:00Z',
      },
      'notes.txt': 'not a record at all',
    })
    const runs = readEvalRuns(dir)
    expect(runs.map(record => record.file)).toEqual(['good.json'])
  })

  test('evalHistory returns at most the limit, and nothing at zero', () => {
    const dir = resultsDir({
      'a.json': run({ ranAt: '2026-09-21T00:00:00.000Z' }),
      'b.json': run({ ranAt: '2026-09-20T00:00:00.000Z' }),
      'c.json': run({ ranAt: '2026-09-19T00:00:00.000Z' }),
    })
    expect(evalHistory(2, dir).map(record => record.file)).toEqual([
      'a.json',
      'b.json',
    ])
    expect(evalHistory(0, dir)).toEqual([])
    expect(evalHistory(10, dir).length).toBe(3)
  })
})

describe('the committed records', () => {
  test('every file in evals/results is one the site can publish', () => {
    // The guard that matters: this is the published directory, not a
    // fixture. A record that fails it would vanish from the page with only
    // a build warning.
    const dir = path.join(process.cwd(), 'evals', 'results')
    const files = fs.readdirSync(dir).filter(name => name.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(path.join(dir, name), 'utf8')
      )
      expect(isEvalSummary(parsed)).toBe(true)
    }
    expect(readEvalRuns(dir).length).toBe(files.length)
  })

  test('every record names a commit, so every run is version-linked', () => {
    for (const record of readEvalRuns(
      path.join(process.cwd(), 'evals', 'results')
    ))
      expect(isCommitSha(record.commit)).toBe(true)
  })
})
