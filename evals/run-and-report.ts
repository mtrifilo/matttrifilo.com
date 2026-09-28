import { spawnSync } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'

/**
 * Run the eval suites, then summarise them whatever the run's exit status.
 *
 * promptfoo exits 100 when any test fails, and a red run is exactly the one
 * the publish gate has to see: it refuses on the summary's pass rates and
 * flake counters, so a run that ends before its summary is written cannot be
 * refused on the merits. This spawns the two steps in turn and composes their
 * exit statuses: the summary is written for every run that produced results,
 * and the process still exits non-zero when the run was red, when it wrote no
 * results, or when the report itself failed.
 *
 * The promptfoo command lines, and the environment they need, stay in
 * package.json (`evals:run`, `evals:smoke:run`) so either step can still be
 * run on its own. Both set `PROMPTFOO_SCHEDULER_QUEUE_TIMEOUT_MS=900000`:
 * promptfoo's per-provider adaptive scheduler queues the rubric grader's
 * calls, three grades per rubric test at route concurrency 8 can wait longer
 * than its five-minute default, and a grade that timed out in that queue is
 * reported as an error row although nothing about the answer was judged.
 *
 * Usage: bun run evals/run-and-report.ts <full|smoke>
 */

export interface EvalRunPlan {
  /** The package.json script that runs promptfoo and writes `results`. */
  runScript: string
  results: string
  summary: string
}

/**
 * The smoke subset writes its own pair of files, so a filtered run can never
 * become the `summary.json` that `evals:publish` reads.
 */
export const EVAL_RUN_PLANS = {
  full: {
    runScript: 'evals:run',
    results: 'evals/out/results.json',
    summary: 'evals/out/summary.json',
  },
  smoke: {
    runScript: 'evals:smoke:run',
    results: 'evals/out/smoke-results.json',
    summary: 'evals/out/smoke-summary.json',
  },
} as const satisfies Record<string, EvalRunPlan>

export type EvalRunMode = keyof typeof EVAL_RUN_PLANS

/**
 * An exit status as `spawnSync` reports it: null when the step was killed by
 * a signal, which is a failure with no number of its own.
 */
export type StepStatus = number | null

/**
 * The exit code for the whole run.
 *
 * A failed run step wins, with its own code, so promptfoo's 100 for "tests
 * failed" survives a report that exited 1 for the same reason. A run step
 * that succeeded defers to the report, which is non-zero on any failed row.
 * `report` is null when the report was skipped because the run wrote no
 * results, and that is never a pass, even when promptfoo exited 0: an
 * evaluation paused with Ctrl+C returns before promptfoo writes its output.
 * A signal that killed the runner itself exits with the shell's code for it
 * instead, which is non-zero as well.
 */
export function composeExitCode(run: StepStatus, report: StepStatus): number {
  if (run !== 0) return run ?? 1
  if (report === null) return 1
  return report
}

/** The results file's modification time, or null when there is none. */
export function modifiedAt(path: string): number | null {
  return existsSync(path) ? statSync(path).mtimeMs : null
}

/**
 * Whether the run step wrote `path`. A results file already on disk before
 * the run started is some earlier run's, and summarising it would stamp that
 * run's rows with this run's date.
 */
export function writtenSince(path: string, before: number | null): boolean {
  const after = modifiedAt(path)
  if (after === null) return false
  return before === null || after > before
}

export interface RunAndReportSteps {
  run: readonly string[]
  report: readonly string[]
  results: string
  /** Where `report` writes; removed before the run, so it is always this run's. */
  summary: string
}

function runStep(argv: readonly string[]): StepStatus {
  const [command, ...args] = argv
  const child = spawnSync(command, args, { stdio: 'inherit' })
  if (child.error) {
    console.error(`could not start ${command}: ${child.error.message}`)
    return null
  }
  return child.status
}

/**
 * Run `run`, then `report` if `run` wrote `results`, and return the composed
 * exit code. Commands are argv arrays, so a test can substitute a fake step.
 *
 * The previous summary is removed first. `evals:publish` reads whatever
 * summary is on disk and names it after the current HEAD, so an earlier
 * run's summary left behind by a run that wrote nothing would be published
 * as this commit's record. With it gone, publishing refuses for want of a
 * summary. The earlier results file is left alone: it is the evidence, and
 * a successful run overwrites it anyway.
 */
export function runAndReport(steps: RunAndReportSteps): number {
  rmSync(steps.summary, { force: true })
  const before = modifiedAt(steps.results)
  const run = runStep(steps.run)
  if (!writtenSince(steps.results, before)) {
    console.error(
      `the eval run wrote no results to ${steps.results}, so there is nothing to summarise and no summary was written`
    )
    return composeExitCode(run, null)
  }
  return composeExitCode(run, runStep(steps.report))
}

/** The two steps for a mode, run with the bun that is running this script. */
export function stepsFor(mode: EvalRunMode): RunAndReportSteps {
  const plan = EVAL_RUN_PLANS[mode]
  const bun = process.execPath
  return {
    run: [bun, 'run', plan.runScript],
    report: [bun, 'run', 'evals/summarize.ts', plan.results, plan.summary],
    results: plan.results,
    summary: plan.summary,
  }
}

function isMode(value: string | undefined): value is EvalRunMode {
  return (
    value !== undefined &&
    Object.prototype.hasOwnProperty.call(EVAL_RUN_PLANS, value)
  )
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const mode = args[0]
  if (args.length !== 1 || !isMode(mode)) {
    console.error(
      `usage: bun run evals/run-and-report.ts <${Object.keys(EVAL_RUN_PLANS).join('|')}>`
    )
    process.exit(2)
  }
  // Ctrl+C reaches the whole process group. Without a listener it would kill
  // this runner at once, before it can say the run wrote no results; with
  // one, the steps decide how to stop and the runner still reports on them.
  process.on('SIGINT', () => {})
  process.exit(runAndReport(stepsFor(mode)))
}
