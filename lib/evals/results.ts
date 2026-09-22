import fs from 'fs'
import path from 'path'
import type { EvalSummary, SuiteSummary } from '@/evals/summary'

/**
 * The published record of the assistant's eval runs: the committed summary
 * files under `evals/results/`, read from disk while the pages that show
 * them are prerendered (MTC-44).
 *
 * Server only. It touches the filesystem, so it may be imported by a server
 * component or a script and by nothing that ships to a browser, the way
 * lib/knowledge is. The files are data nothing imports, so a route that ever
 * reads them at request time instead of at prerender needs an
 * `outputFileTracingIncludes` entry in next.config.ts or it finds nothing in
 * production.
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

/**
 * Where `bun run evals:publish` writes and where the page reads, resolved
 * here so every caller reads and writes the same place.
 */
export function evalResultsDir(): string {
  return path.join(process.cwd(), 'evals', 'results')
}

/** What a rendered label may be: short, and free of control or format characters. */
const MAX_LABEL_LENGTH = 64

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

/**
 * A string the page can put in front of a visitor as it stands. Control and
 * format characters are refused, not escaped: a bidirectional override or a
 * line separator inside a model id or a suite name rearranges the text
 * around it, and React escapes markup but not those.
 */
function isLabel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_LABEL_LENGTH &&
    !/\p{C}/u.test(value)
  )
}

/** A test count: whole, and not negative. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * An ISO timestamp in UTC, as `toISOString` writes one. The trailing `Z` is
 * required rather than optional: the file name is the first ten characters
 * of this string and the page formats it in UTC, so an offset or a bare
 * local time would date the record differently in its name, on the page and
 * in the sort.
 */
function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}

function isSuiteSummary(value: unknown): value is SuiteSummary {
  if (!value || typeof value !== 'object') return false
  const suite = value as Record<string, unknown>
  return (
    isLabel(suite.name) &&
    isCount(suite.passed) &&
    isCount(suite.total) &&
    suite.passed <= suite.total
  )
}

function isTotals(value: unknown): value is EvalSummary['totals'] {
  if (!value || typeof value !== 'object') return false
  const { passed, total } = value as Record<string, unknown>
  return isCount(passed) && isCount(total) && passed <= total
}

/**
 * One guard per field of the record, keyed by the field, so a field added to
 * EvalSummary is a type error here until it is validated. Every field is
 * rendered on a public page; none of them may arrive unchecked.
 */
const FIELD_GUARDS: Record<keyof EvalSummary, (value: unknown) => boolean> = {
  commit: isLabel,
  ranAt: isTimestamp,
  model: isLabel,
  promptfooVersion: value => value === undefined || isLabel(value),
  suites: value => Array.isArray(value) && value.every(isSuiteSummary),
  totals: isTotals,
  retried: isCount,
}

/**
 * Why a record cannot be published, in the words of the field that failed,
 * or null when it can be. Named rather than merely refused: a run costs
 * money and minutes, and "not an eval summary" does not say what to fix.
 *
 * Validating at the boundary instead of trusting a cast follows
 * lib/github.ts, which validates GitHub's response the same way. This file
 * is committed rather than fetched, but it is still data written by another
 * process and the page renders every field of it.
 *
 * Two invariants beyond the field types, both because the page reads the
 * counts as fractions: no count exceeds its total, and the suite rows add up
 * to the totals row. `summarise` derives the totals from the suites, so a
 * record that fails either was not written by a run.
 */
export function evalSummaryProblem(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'it is not an object'
  const record = value as Record<string, unknown>
  for (const [field, guard] of Object.entries(FIELD_GUARDS))
    if (!guard(record[field]))
      return `its \`${field}\` is missing or not something this page can publish`
  const suites = record.suites as SuiteSummary[]
  const totals = record.totals as EvalSummary['totals']
  // One row per suite. Two rows under one name are two React keys and two
  // readings of the same number.
  if (new Set(suites.map(suite => suite.name)).size !== suites.length)
    return 'it names a suite more than once'
  return sum(suites, suite => suite.passed) === totals.passed &&
    sum(suites, suite => suite.total) === totals.total
    ? null
    : 'its suite rows do not add up to its totals row'
}

export function isEvalSummary(value: unknown): value is EvalSummary {
  return evalSummaryProblem(value) === null
}

/**
 * Every published run, newest first.
 *
 * Not memoised: the directory holds one small file per recorded run, and the
 * callers below read it a handful of times in one build.
 */
export function readEvalRuns(dir: string = evalResultsDir()): EvalRun[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch (error) {
    // No directory means nothing has been published, which the page says in
    // its own words. Anything else is a directory that exists and could not
    // be read, and silently publishing "no run yet" for that would hide it.
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT')
      console.warn(`[evals] could not read ${dir}; no run is published`, error)
    return []
  }

  const runs: EvalRun[] = []
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.json')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
    } catch {
      warnSkipped(dir, name, 'it does not parse as JSON')
      continue
    }
    const problem = evalSummaryProblem(parsed)
    if (problem !== null) {
      warnSkipped(dir, name, problem)
      continue
    }
    runs.push({ ...(parsed as EvalSummary), file: name })
  }

  // Newest first by when the run happened rather than by file name, so a
  // record published out of order still lands where it belongs. The file
  // name breaks a tie, compared directly rather than by locale so every
  // build renders the same order.
  return runs.sort(
    (a, b) =>
      Date.parse(b.ranAt) - Date.parse(a.ranAt) || compare(b.file, a.file)
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

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((running, item) => running + value(item), 0)
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function warnSkipped(dir: string, name: string, reason: string): void {
  console.warn(
    `[evals] skipping ${path.join(dir, name)}: ${reason}. Delete it or replace it with a record a run produced.`
  )
}
