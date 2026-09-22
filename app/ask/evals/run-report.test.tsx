import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EvalRun } from '@/lib/evals/results'
import { History, LatestRun } from './run-report'
import { SUITE_NOTES } from './suite-notes'

/**
 * The page with a run on it. Nothing else renders this state: the published
 * directory can be empty, and then the only thing a build proves is the
 * sentence that says so.
 */

const run = (over: Partial<EvalRun> = {}): EvalRun => ({
  file: '2026-09-21-6406ee4.json',
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

describe('the latest run', () => {
  test('shows what the run was, and what it ran against', () => {
    const html = renderToStaticMarkup(<LatestRun run={run()} />)
    expect(html).toContain('September 21, 2026')
    expect(html).toContain('gemini-3.8-flash')
    expect(html).toContain('0.123.0')
    expect(html).toContain('>5<')
  })

  test('links the commit to its page, by its short name', () => {
    const html = renderToStaticMarkup(<LatestRun run={run()} />)
    expect(html).toContain(
      'https://github.com/mtrifilo/matttrifilo.com/commit/6406ee4d4afe1da0290d23a1f0afa3bf6e225902'
    )
    expect(html).toContain('>6406ee4<')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  test('does not link a run that recorded no commit', () => {
    const html = renderToStaticMarkup(
      <LatestRun run={run({ commit: 'local' })} />
    )
    expect(html).toContain('local')
    expect(html).not.toContain('/commit/')
  })

  test('omits the promptfoo version a record does not carry', () => {
    const older = run()
    delete older.promptfooVersion
    const html = renderToStaticMarkup(<LatestRun run={older} />)
    expect(html).not.toContain('Promptfoo')
  })

  test('shows every suite row and the total', () => {
    const html = renderToStaticMarkup(<LatestRun run={run()} />)
    expect(html).toContain('>golden<')
    expect(html).toContain('>67<')
    expect(html).toContain('>74<')
    expect(html).toContain('All suites')
    expect(html).toContain('>91<')
    expect(html).toContain('>98<')
  })

  test('says what each suite it knows checks, and nothing about one it does not', () => {
    const html = renderToStaticMarkup(
      <LatestRun
        run={run({
          suites: [
            { name: 'golden', passed: 1, total: 1 },
            { name: 'a-suite-added-later', passed: 1, total: 1 },
          ],
          totals: { passed: 2, total: 2 },
        })}
      />
    )
    expect(html).toContain(SUITE_NOTES.golden)
    // The row is still published; only the sentence is missing, because
    // nobody has written one.
    expect(html).toContain('a-suite-added-later')
  })

  test('publishes no question, answer or rationale, because it is given none', () => {
    const html = renderToStaticMarkup(<LatestRun run={run()} />)
    expect(html).not.toContain('?')
  })
})

describe('the history', () => {
  test('is one line per run, oldest last', () => {
    const html = renderToStaticMarkup(
      <History
        runs={[
          run(),
          run({
            file: '2026-08-01-1f2e3d4.json',
            ranAt: '2026-08-01T10:00:00.000Z',
            commit: '1f2e3d4c5b6a7980112233445566778899aabbcc',
          }),
        ]}
      />
    )
    expect(html).toContain('91 of 98 passed')
    expect(html).toContain('September 21, 2026')
    expect(html).toContain('August 1, 2026')
    expect(html.indexOf('September 21')).toBeLessThan(html.indexOf('August 1'))
  })
})
