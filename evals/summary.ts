/**
 * Shaping a promptfoo run into the two things anyone reads afterwards
 * (MTC-32): a per-suite table in the job summary, and a small JSON file the
 * site publishes.
 *
 * Pure: it takes the parsed results object and returns values. The file
 * reading and writing lives in ./summarize.ts so this can be covered by
 * `bun test` without a run.
 */

/**
 * The stable artifact shape. `lib/evals/results.ts` validates every field of
 * it, `app/ask/evals/page.tsx` renders the run and its suite counts, and the
 * three quality counters below decide whether the record may be published at
 * all, so a field added here is a field committed to a public repository.
 */
export interface EvalSummary {
  commit: string
  ranAt: string
  model: string
  /**
   * The promptfoo that ran the suites. Optional in the artifact because a run
   * that cannot read its own installed version records none rather than a
   * guess; the publish gate then refuses the summary, so no published record
   * is missing it.
   */
  promptfooVersion?: string
  suites: SuiteSummary[]
  totals: { passed: number; total: number }
  /**
   * Tests whose first attempt was lost to a stalled Vertex connection and
   * which the provider sent again. Reported because it is the difference
   * between "the assistant is fine and the network was not" and a real
   * regression, and because it is what the run actually cost.
   */
  retried: number
  /**
   * Tests that produced no answer to grade: an error envelope after every
   * attempt, a stream with no text in it, or a row that never reached the
   * provider at all. They are not evidence about the assistant, and an
   * absence check passes on them, so a run with any of them cannot be
   * published.
   */
  transportFailures: number
  /**
   * Answers that used a document and wrote no `Sources:` trailer, as
   * `isUncitedAnswer` in evals/assertions.ts defines that. The groundedness
   * suite tolerates a single miss where the run read the document the test
   * names, so this count and the `warning:` reasons in `results.json` are
   * where a citation line going missing is visible at all.
   */
  missingTrailer: number
}

export interface SuiteSummary {
  name: string
  passed: number
  total: number
}

/** Only the fields of a promptfoo result row this module reads. */
export interface ResultRow {
  success?: boolean
  testCase?: { metadata?: Record<string, unknown> }
  metadata?: Record<string, unknown>
}

export interface ResultsFile {
  results?: { results?: ResultRow[] }
}

/**
 * Tests whose row carries no `suite` metadata.
 *
 * They are still counted, under this name, rather than dropped: a suite file
 * that forgot the metadata would otherwise shrink the totals silently and a
 * red run could look green.
 */
export const UNLABELLED_SUITE = 'unlabelled'

export interface SummariseInput {
  results: ResultsFile
  commit: string
  ranAt: string
  /** Falls back to the model the provider reported on each row. */
  model?: string
  /** Omitted when the caller could not read the installed promptfoo. */
  promptfooVersion?: string
}

export function summarise({
  results,
  commit,
  ranAt,
  model,
  promptfooVersion,
}: SummariseInput): EvalSummary {
  const rows = results.results?.results ?? []
  const bySuite = new Map<string, SuiteSummary>()

  for (const row of rows) {
    const name = readString(row.testCase?.metadata?.suite) ?? UNLABELLED_SUITE
    const suite = bySuite.get(name) ?? { name, passed: 0, total: 0 }
    suite.total += 1
    if (row.success === true) suite.passed += 1
    bySuite.set(name, suite)
  }

  const suites = [...bySuite.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  return {
    commit,
    ranAt,
    model: model ?? reportedModel(rows) ?? 'unknown',
    ...(promptfooVersion ? { promptfooVersion } : {}),
    suites,
    totals: {
      passed: suites.reduce((sum, suite) => sum + suite.passed, 0),
      total: suites.reduce((sum, suite) => sum + suite.total, 0),
    },
    retried: rows.filter(row => (readNumber(row.metadata?.attempt) ?? 1) > 1)
      .length,
    transportFailures: rows.filter(hasNothingToGrade).length,
    missingTrailer: countFlagged(rows, 'missingTrailer'),
  }
}

/**
 * The row produced no answer to grade.
 *
 * Two ways in. The provider says so on a row it handled, by raising
 * `transportFailure`. The other way is a row the provider never got to
 * report on: a throw in `callApi` (a credential check, or the handler
 * itself) reaches promptfoo as an error row carrying no provider metadata at
 * all, and `model` is the field every provider response sets. A failed row
 * without one never ran the route, which is the same kind of nothing.
 */
function hasNothingToGrade(row: ResultRow): boolean {
  if (row.metadata?.transportFailure === true) return true
  return row.success !== true && readString(row.metadata?.model) === undefined
}

/** Rows whose provider metadata raised one of the run-quality flags. */
function countFlagged(rows: ResultRow[], flag: string): number {
  return rows.filter(row => row.metadata?.[flag] === true).length
}

/** The GitHub step summary table. */
export function markdownTable(summary: EvalSummary): string {
  const lines = [
    `Model \`${summary.model}\` at commit \`${summary.commit.slice(0, 7)}\`, run ${summary.ranAt}.`,
    summary.retried > 0
      ? `${summary.retried} test(s) were sent twice after a stalled Vertex connection.`
      : 'No test needed a second attempt.',
    summary.transportFailures > 0
      ? `${summary.transportFailures} test(s) produced no answer to grade, so this run cannot be published; results.json names the code on each row.`
      : 'Every test produced an answer to grade.',
    summary.missingTrailer > 0
      ? `${summary.missingTrailer} answer(s) used a document without a Sources: trailer.`
      : 'Every answer that used a document carried its Sources: trailer.',
    '',
    '| Suite | Passed | Total |',
    '| --- | ---: | ---: |',
    ...summary.suites.map(
      suite => `| ${suite.name} | ${suite.passed} | ${suite.total} |`
    ),
    `| **total** | **${summary.totals.passed}** | **${summary.totals.total}** |`,
  ]
  return lines.join('\n')
}

/** Whether every test passed. A run with no tests at all is not a pass. */
export function allPassed(summary: EvalSummary): boolean {
  return (
    summary.totals.total > 0 && summary.totals.passed === summary.totals.total
  )
}

/**
 * The model the provider reported. Taken from the first row that has one, and
 * only used when the caller did not supply one.
 */
function reportedModel(rows: ResultRow[]): string | undefined {
  for (const row of rows) {
    const model = readString(row.metadata?.model)
    if (model) return model
  }
  return undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}
