import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  EVAL_RESULTS_DIR,
  isCommitSha,
  isEvalSummary,
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
 * no commit can be named, or when a record already exists under that name.
 * A published record is never edited afterwards; a new run adds a new file.
 *
 * Usage: bun run evals:publish [summary.json]
 */

/**
 * The commit the record names.
 *
 * A run in CI records the commit it tested. A local run has no `GITHUB_SHA`
 * and records `local`, which is true but not a version, so the working
 * copy's HEAD stands in: it is the commit the publisher is about to attach
 * the record to. Returns null when neither is a git object name, because a
 * record that names no commit cannot be version-linked and must not ship.
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
 * `ranAt` records it, and the commit it covers. Sortable, unique per run,
 * and readable in a directory listing without opening anything.
 */
export function resultFileName(ranAt: string, commit: string): string {
  return `${ranAt.slice(0, 10)}-${shortCommit(commit)}.json`
}

/** The working copy's HEAD, or null when git cannot answer. */
function headCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
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
  if (!isEvalSummary(parsed)) {
    fail(
      `${summaryPath} is missing its totals or is otherwise not an eval summary; refusing to publish it`
    )
  }
  const summary: EvalSummary = parsed

  const commit = publishedCommit(summary.commit, headCommit())
  if (!commit) {
    fail(
      `the run recorded commit "${summary.commit}" and git HEAD could not be read, so the record would name no commit`
    )
  }

  const dir = resolve(EVAL_RESULTS_DIR)
  const target = join(dir, resultFileName(summary.ranAt, commit))
  if (existsSync(target)) {
    fail(
      `${target} already exists. Published records are not edited; delete it first if this run is meant to replace it.`
    )
  }

  mkdirSync(dir, { recursive: true })
  writeFileSync(target, `${JSON.stringify({ ...summary, commit }, null, 2)}\n`)
  console.log(
    `published ${target}\ncommit it in the same pull request as the change this run covers.`
  )
}

if (import.meta.main) main()
