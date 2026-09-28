import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  EVAL_RUN_PLANS,
  composeExitCode,
  runAndReport,
  stepsFor,
  writtenSince,
} from './run-and-report'

describe('composeExitCode', () => {
  test('a clean run and a clean report pass', () => {
    expect(composeExitCode(0, 0)).toBe(0)
  })

  test("a red run keeps promptfoo's own code over the report's", () => {
    expect(composeExitCode(100, 1)).toBe(100)
    expect(composeExitCode(100, 0)).toBe(100)
  })

  test('a clean run defers to a failing report', () => {
    expect(composeExitCode(0, 1)).toBe(1)
  })

  test('a skipped report is never a pass, whatever the run exited', () => {
    expect(composeExitCode(0, null)).toBe(1)
    expect(composeExitCode(100, null)).toBe(100)
  })

  test('a step killed by a signal is a failure', () => {
    expect(composeExitCode(null, null)).toBe(1)
    expect(composeExitCode(null, 0)).toBe(1)
    expect(composeExitCode(0, null)).toBe(1)
  })
})

describe('runAndReport with fake steps', () => {
  let dir: string
  let results: string
  let summary: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mtc61-run-and-report-'))
    results = join(dir, 'results.json')
    summary = join(dir, 'summary.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** A step that runs `script` in sh; `$1` is the results file. */
  const sh = (script: string) => ['/bin/sh', '-c', script, 'step', results]
  const writesResults = (code: number) => sh(`echo '{}' > "$1"; exit ${code}`)
  const report = (code: number) =>
    ['/bin/sh', '-c', `touch "$1"; exit ${code}`, 'report', summary] as const

  test('a green run is summarised and exits 0', () => {
    expect(
      runAndReport({
        run: writesResults(0),
        report: report(0),
        results,
        summary,
      })
    ).toBe(0)
    expect(existsSync(summary)).toBe(true)
  })

  test('a red run is still summarised, and exits with the run code', () => {
    expect(
      runAndReport({
        run: writesResults(100),
        report: report(1),
        results,
        summary,
      })
    ).toBe(100)
    expect(existsSync(summary)).toBe(true)
  })

  test('a run that wrote no results is not summarised and exits non-zero', () => {
    expect(
      runAndReport({ run: sh('exit 1'), report: report(0), results, summary })
    ).toBe(1)
    expect(existsSync(summary)).toBe(false)
  })

  test('a run that exited 0 without writing results is not a pass', () => {
    expect(
      runAndReport({ run: sh('exit 0'), report: report(0), results, summary })
    ).toBe(1)
    expect(existsSync(summary)).toBe(false)
  })

  test("an earlier run's results file is not summarised as this run's", () => {
    writeFileSync(results, '{}')
    const anHourAgo = new Date(Date.now() - 3_600_000)
    utimesSync(results, anHourAgo, anHourAgo)

    expect(
      runAndReport({ run: sh('exit 100'), report: report(0), results, summary })
    ).toBe(100)
    expect(existsSync(summary)).toBe(false)
  })

  test('a run that rewrites an earlier results file is summarised', () => {
    writeFileSync(results, '{}')
    const anHourAgo = new Date(Date.now() - 3_600_000)
    utimesSync(results, anHourAgo, anHourAgo)

    expect(
      runAndReport({
        run: writesResults(100),
        report: report(0),
        results,
        summary,
      })
    ).toBe(100)
    expect(existsSync(summary)).toBe(true)
  })

  test('a run killed by a signal after writing results exits non-zero', () => {
    const killed = sh(`echo '{}' > "$1"; kill -TERM $$`)
    expect(
      runAndReport({ run: killed, report: report(0), results, summary })
    ).toBe(1)
  })

  test("a run that writes nothing leaves no earlier run's summary behind", () => {
    writeFileSync(summary, '{"ranAt":"an earlier run"}')

    expect(
      runAndReport({ run: sh('exit 1'), report: report(0), results, summary })
    ).toBe(1)
    expect(existsSync(summary)).toBe(false)
  })

  test("a red run replaces an earlier run's summary with its own", () => {
    writeFileSync(summary, '{"ranAt":"an earlier run"}')

    expect(
      runAndReport({
        run: writesResults(100),
        report: report(1),
        results,
        summary,
      })
    ).toBe(100)
    expect(readFileSync(summary, 'utf8')).toBe('')
  })

  test('a step that cannot start is a failure, not a crash', () => {
    expect(
      runAndReport({
        run: [join(dir, 'no-such-command')],
        report: report(0),
        results,
        summary,
      })
    ).toBe(1)
  })
})

describe('writtenSince', () => {
  test('a missing file was not written', () => {
    expect(writtenSince('/nonexistent/mtc61/results.json', null)).toBe(false)
  })
})

describe('the plans and package.json agree', () => {
  const scripts = (
    JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
  ).scripts

  test('evals and evals:smoke go through the runner', () => {
    expect(scripts.evals).toBe('bun run evals/run-and-report.ts full')
    expect(scripts['evals:smoke']).toBe('bun run evals/run-and-report.ts smoke')
  })

  for (const [mode, plan] of Object.entries(EVAL_RUN_PLANS)) {
    test(`${mode}: the run script writes the file the runner summarises`, () => {
      const command = scripts[plan.runScript]
      expect(command).toContain(`--output ${plan.results}`)
      expect(command.match(/--output\b/g)).toHaveLength(1)
    })

    // The reason is in run-and-report.ts's module comment and in the runbook,
    // under "Running them locally".
    test(`${mode}: the run script lets a queued grader wait fifteen minutes`, () => {
      expect(scripts[plan.runScript]).toContain(
        'PROMPTFOO_SCHEDULER_QUEUE_TIMEOUT_MS=900000'
      )
    })

    test(`${mode}: the run script keeps the grader cache off`, () => {
      expect(scripts[plan.runScript]).toContain('PROMPTFOO_CACHE_ENABLED=false')
    })

    test(`${mode}: the report reads and writes the plan's files`, () => {
      const steps = stepsFor(mode as keyof typeof EVAL_RUN_PLANS)
      expect(steps.report.slice(2)).toEqual([
        'evals/summarize.ts',
        plan.results,
        plan.summary,
      ])
      expect(steps.summary).toBe(plan.summary)
    })
  }

  test('evals:compare lets a queued grader wait fifteen minutes too', () => {
    expect(scripts['evals:compare']).toContain(
      'PROMPTFOO_SCHEDULER_QUEUE_TIMEOUT_MS=900000'
    )
  })

  test('evals:report summarises the same files as a full run', () => {
    const { results, summary } = EVAL_RUN_PLANS.full
    expect(scripts['evals:report']).toBe(
      `bun run evals/summarize.ts ${results} ${summary}`
    )
  })
})
