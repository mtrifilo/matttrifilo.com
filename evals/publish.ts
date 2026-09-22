import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  evalRecordProblem,
  evalResultsDir,
  isCommitSha,
  shortCommit,
} from '@/lib/evals/results'
import type { EvalSummary } from './summary'

/**
 * Copy a finished run's `evals/out/summary.json` into `evals/results/`, the
 * committed directory the site publishes from (MTC-44).
 *
 * The run output itself is gitignored and per-commit. This is the deliberate
 * step that turns one of those runs into a public record: it is run by hand,
 * after a local `bun run evals`, and the file it writes is committed in the
 * same pull request as the corpus, prompt or suite change the run covers.
 *
 * It refuses rather than publishes when the summary is not a summary, when
 * the run is not good enough to stand as evidence (the floor in
 * `lib/evals/results.ts`, which the site applies again on read), when no
 * commit can be named, when the working copy is dirty, or when a record
 * already exists under that name. A committed record is never edited
 * afterwards; a new run adds a new file.
 *
 * There is no force flag and no environment override, on purpose: the page
 * the record feeds is a credibility page, and a bad record published under
 * the same claim as a good one is worse than no record. The answer to a
 * refusal is another run.
 *
 * What it cannot do is stop someone writing a false record deliberately:
 * `evals/out/` is not committed, so a hand-edited summary reaches this script
 * as a summary. Reviewing the record in the diff is what catches that. This
 * gate is against publishing a run that went badly, not against fraud.
 *
 * Usage: bun run evals:publish [summary.json]
 */

export interface PublishPlan {
  file: string
  record: EvalSummary
}

export type PublishDecision = PublishPlan | { refusal: string }

/**
 * The commit the record names.
 *
 * A run in CI records the commit it tested. A local run has no `GITHUB_SHA`
 * and records `local`, which is true but not a version, so the working
 * copy's HEAD stands in: it is the commit the publisher is about to attach
 * the record to, and it names the code that ran only if that code is
 * committed, which is why main() refuses to publish from a dirty tree. Returns null when
 * neither is a git object name, because a record that names no commit cannot
 * be version-linked and must not ship.
 */
export function publishedCommit(
  summaryCommit: string,
  headSha: string | null
): string | null {
  if (isCommitSha(summaryCommit)) return summaryCommit
  return headSha && isCommitSha(headSha) ? headSha : null
}

/**
 * `<YYYY-MM-DD>-<7-char sha>.json`: the date the run happened, in UTC as
 * `ranAt` records it, and the commit it covers. Sortable, readable in a
 * directory listing, and the name the site reads the record by.
 */
export function resultFileName(ranAt: string, commit: string): string {
  return `${ranAt.slice(0, 10)}-${shortCommit(commit)}.json`
}

/**
 * What to write, or why nothing is written. Pure, so every refusal is
 * covered by a test rather than by running the script.
 *
 * The record is built field by field rather than copied: `summary.json` is
 * produced from a results file that holds every question and every answer,
 * and this directory is committed to a public repository. A field that is
 * meant to be published is added here, deliberately, by someone reading the
 * diff.
 */
export function planPublish(
  parsed: unknown,
  headSha: string | null
): PublishDecision {
  const problem = evalRecordProblem(parsed)
  if (problem !== null)
    return { refusal: `the summary cannot be published because ${problem}` }
  const summary = parsed as EvalSummary

  const commit = publishedCommit(summary.commit, headSha)
  if (!commit)
    return {
      refusal: `the run recorded commit "${summary.commit}" and git HEAD could not be read, so the record would name no commit`,
    }

  return {
    file: resultFileName(summary.ranAt, commit),
    record: {
      commit,
      ranAt: summary.ranAt,
      model: summary.model,
      // Always present: the floor refuses a summary that names no version.
      promptfooVersion: summary.promptfooVersion,
      suites: summary.suites.map(({ name, passed, total }) => ({
        name,
        passed,
        total,
      })),
      totals: { passed: summary.totals.passed, total: summary.totals.total },
      retried: summary.retried,
      transportFailures: summary.transportFailures,
      missingTrailer: summary.missingTrailer,
    },
  }
}

/** The working copy's HEAD, or null when git cannot answer. */
function headCommit(): string | null {
  return git(['rev-parse', 'HEAD'])
}

/**
 * Whether the working copy is known to carry changes HEAD does not.
 *
 * Fails closed: a git that cannot answer is `unknown`, not `clean`. The
 * record's claim is that some commit contains the suites and the corpus the
 * run walked, and a directory where git will not say cannot support it. That
 * also closes the one way the refusal could be lifted from outside the
 * script, by pointing `GIT_DIR` somewhere git fails.
 */
function workingCopyState(): 'clean' | 'dirty' | 'unknown' {
  const status = git(['status', '--porcelain'])
  if (status === null) return 'unknown'
  return status.length > 0 ? 'dirty' : 'clean'
}

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function fail(message: string): never {
  console.error(`evals:publish: ${message}`)
  process.exit(1)
}

function main(): void {
  const summaryPath = resolve(process.argv[2] ?? 'evals/out/summary.json')
  if (!existsSync(summaryPath)) {
    fail(
      `no summary at ${summaryPath}. Run \`bun run evals\` first, or \`bun run evals:report\` if a results.json is already there.`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(summaryPath, 'utf8'))
  } catch {
    fail(`${summaryPath} does not parse as JSON`)
  }

  // git is only consulted for a run that recorded no commit of its own.
  const recorded = (parsed as { commit?: unknown } | null)?.commit
  const needsHead = typeof recorded !== 'string' || !isCommitSha(recorded)
  const decision = planPublish(parsed, needsHead ? headCommit() : null)
  if ('refusal' in decision)
    fail(
      `${decision.refusal}; refusing to publish. Re-run the suites when Vertex is healthy, or dispatch .github/workflows/evals.yml by hand; the per-row flags behind these counts are in the run's results.json under \`metadata\`, and the rules are in docs/career-assistant-operations.md under "Publishing a run"`
    )

  // The record has to name a commit that contains the suites and the corpus
  // the run walked. An uncommitted change means it does not, whichever
  // commit is named, so this is a refusal rather than the warning it used to
  // be: a record pointing at code that never ran is a false claim on a page
  // a hiring manager reads as evidence.
  const tree = workingCopyState()
  if (tree !== 'clean') {
    fail(
      tree === 'dirty'
        ? 'the working copy has uncommitted changes, so no commit contains the code this run walked. Commit the change the run covers first, then publish; refusing to publish'
        : 'git could not say whether this working copy is clean, so nothing here can name the code the run walked. Run this from the repository; refusing to publish'
    )
  }

  const dir = evalResultsDir()
  const target = join(dir, decision.file)
  mkdirSync(dir, { recursive: true })
  try {
    // `wx` is the refusal, not a check before it: a published record is never
    // edited, and an existence test followed by a write is only mostly true.
    writeFileSync(target, `${JSON.stringify(decision.record, null, 2)}\n`, {
      flag: 'wx',
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST')
      fail(
        `${target} already exists. A committed record is never replaced; delete the file first only if this run supersedes one that has not been committed yet.`
      )
    throw error
  }
  console.log(
    `published ${target}\ncommit it in the same pull request as the change this run covers.`
  )
}

if (import.meta.main) main()
