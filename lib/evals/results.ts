import fs from 'fs'
import path from 'path'
import type { EvalSummary, SuiteSummary } from '@/evals/summary'

/**
 * The published record of the assistant's eval runs: the committed summary
 * files under `evals/results/`, read from disk at build time (MTC-44).
 *
 * Server only. It touches the filesystem, so it may be imported by a server
 * component or a script and by nothing that ships to a browser, the way
 * lib/knowledge is.
 *
 * A record is published exactly as the run wrote it. Nothing here recomputes
 * a count or repairs a file: a file that is not a summary is skipped with a
 * warning rather than taking a build down, and rewriting one would publish a
 * number no run produced.
 */

export type { EvalSummary, SuiteSummary }

export interface EvalRun extends EvalSummary {
  /** The file the record came from. Unique per run, so also its React key. */
  file: string
}

/** Where `bun run evals:publish` writes and where the page reads. */
export const EVAL_RESULTS_DIR = path.join('evals', 'results')

/**
 * A git object name. The `commit` field carries one whenever the run knew
 * which commit it was testing; a run with no `GITHUB_SHA` records `local`,
 * which is a fact about the run and not something to link to a commit page.
 */
export function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/.test(value)
}

/** The seven characters a commit is read by. */
export function shortCommit(value: string): string {
  return value.slice(0, 7)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** A test count: whole, and not negative. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** An ISO timestamp the history can be sorted and dated by. */
function isTimestamp(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}

function isSuiteSummary(value: unknown): value is SuiteSummary {
  if (!value || typeof value !== 'object') return false
  const suite = value as Record<string, unknown>
  return (
    isNonEmptyString(suite.name) &&
    isCount(suite.passed) &&
    isCount(suite.total) &&
    suite.passed <= suite.total
  )
}

/**
 * Validate a record at the boundary instead of trusting a cast, the way
 * lib/github.ts validates GitHub's response. This file is committed rather
 * than fetched, but it is still data written by another process and the page
 * renders every field of it.
 *
 * `passed <= total` is checked because the page reads the two as a fraction,
 * and "153 of 144" is not a state a visitor can interpret.
 */
export function isEvalSummary(value: unknown): value is EvalSummary {
  if (!value || typeof value !== 'object') return false
  const summary = value as Record<string, unknown>
  const totals = summary.totals
  if (!totals || typeof totals !== 'object') return false
  const { passed, total } = totals as Record<string, unknown>
  return (
    isNonEmptyString(summary.commit) &&
    isTimestamp(summary.ranAt) &&
    isNonEmptyString(summary.model) &&
    Array.isArray(summary.suites) &&
    summary.suites.every(isSuiteSummary) &&
    isCount(passed) &&
    isCount(total) &&
    passed <= total &&
    isCount(summary.retried)
  )
}

/**
 * Every published run, newest first.
 *
 * Not memoised: the directory holds one small file per recorded run, and the
 * callers below read it a handful of times in one build.
 */
export function readEvalRuns(dir: string = defaultResultsDir()): EvalRun[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    // Nothing published yet, or the directory did not ship with the build.
    // Either way the page says there is no run rather than failing.
    return []
  }

  const runs: EvalRun[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
    } catch {
      warnSkipped(name, 'it does not parse as JSON')
      continue
    }
    if (!isEvalSummary(parsed)) {
      warnSkipped(name, 'it is not shaped like an eval summary')
      continue
    }
    runs.push({ ...parsed, file: name })
  }

  // Newest first by when the run happened rather than by file name, so a
  // record published out of order still lands where it belongs. The file
  // name breaks a tie so every build renders the same order.
  return runs.sort(
    (a, b) =>
      Date.parse(b.ranAt) - Date.parse(a.ranAt) || b.file.localeCompare(a.file)
  )
}

/** The run the page leads with, or null when none has been published. */
export function latestEvalSummary(dir?: string): EvalRun | null {
  return readEvalRuns(dir)[0] ?? null
}

/** The newest `limit` runs, newest first. */
export function evalHistory(limit: number, dir?: string): EvalRun[] {
  return limit > 0 ? readEvalRuns(dir).slice(0, limit) : []
}

/**
 * Whether the site has a run to show. This decides both whether the page has
 * content and whether the link under the chat pane is offered at all: a link
 * to a page that can only say "no run yet" is worse than no link.
 */
export function hasPublishedEvalRun(dir?: string): boolean {
  return latestEvalSummary(dir) !== null
}

function defaultResultsDir(): string {
  return path.join(process.cwd(), EVAL_RESULTS_DIR)
}

function warnSkipped(name: string, reason: string): void {
  console.warn(
    `[evals] skipping ${path.join(EVAL_RESULTS_DIR, name)}: ${reason}. Republish it with \`bun run evals:publish\`.`
  )
}
