import { isCommitSha, shortCommit, type EvalRun } from '@/lib/evals/results'
import { formatDate } from '@/lib/format-date'
import { SUITE_NOTES } from './suite-notes'

/**
 * What a published run looks like on the page: the run described in full,
 * and the runs before it as a list (MTC-44).
 *
 * Its own module rather than part of ./page, because an App Router page may
 * export only what the router knows and these have to be rendered by a test.
 * The page reads the records; everything here is given them.
 */

const REPO_URL = 'https://github.com/mtrifilo/matttrifilo.com'

/** Matt's copy, like the rest of the page's. */
const GRADING_LIMIT =
  'Deterministic checks are the gate in every suite. Two of them, golden and groundedness, add a model grader where a question needs judgement: each of those answers is graded three times and two of the three have to pass, at a threshold of 0.6. Model grading carries noise of its own, and these counts include it.'

const RETRY_NOTE =
  'Retried counts tests whose first attempt was lost to a stalled connection upstream and was sent again, rather than answered badly.'

export function LatestRun({ run }: { run: EvalRun }) {
  const described = run.suites.filter(suite =>
    Object.hasOwn(SUITE_NOTES, suite.name)
  )

  return (
    <section aria-labelledby="latest-run-heading" className="mt-10">
      <h2 className="text-xl font-semibold" id="latest-run-heading">
        Latest run
      </h2>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <dt>Run</dt>
          <dd className="text-foreground/90">
            <time dateTime={run.ranAt}>{formatDate(run.ranAt)}</time>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Commit</dt>
          <dd className="text-foreground/90">
            <Commit commit={run.commit} />
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Model</dt>
          <dd className="text-foreground/90">{run.model}</dd>
        </div>
        {run.promptfooVersion ? (
          <div className="flex gap-2">
            <dt>Promptfoo</dt>
            <dd className="text-foreground/90">{run.promptfooVersion}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt>Retried</dt>
          <dd className="tabular-nums text-foreground/90">{run.retried}</dd>
        </div>
      </dl>

      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">
          Checks passed per suite in the latest run
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 font-medium" scope="col">
              Suite
            </th>
            <th className="py-2 text-right font-medium" scope="col">
              Passed
            </th>
            <th className="py-2 text-right font-medium" scope="col">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {run.suites.map(suite => (
            <tr className="border-b border-border/60" key={suite.name}>
              <th className="py-2 text-left font-normal" scope="row">
                {suite.name}
              </th>
              <td className="py-2 text-right tabular-nums">{suite.passed}</td>
              <td className="py-2 text-right tabular-nums">{suite.total}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <th className="py-2 text-left" scope="row">
              All suites
            </th>
            <td className="py-2 text-right tabular-nums">
              {run.totals.passed}
            </td>
            <td className="py-2 text-right tabular-nums">{run.totals.total}</td>
          </tr>
        </tbody>
      </table>

      {described.length > 0 && (
        <dl className="mt-6 space-y-3 text-sm leading-relaxed">
          {described.map(suite => (
            <div key={suite.name}>
              <dt className="font-medium">{suite.name}</dt>
              <dd className="text-muted-foreground">
                {SUITE_NOTES[suite.name]}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {GRADING_LIMIT}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {RETRY_NOTE}
      </p>
    </section>
  )
}

export function History({ runs }: { runs: EvalRun[] }) {
  return (
    <section aria-labelledby="run-history-heading" className="mt-10">
      <h2 className="text-xl font-semibold" id="run-history-heading">
        Run history
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {runs.map(run => (
          <li
            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border/60 pb-2 last:border-0"
            key={run.file}
          >
            <time className="text-foreground/90" dateTime={run.ranAt}>
              {formatDate(run.ranAt)}
            </time>
            <span className="tabular-nums text-muted-foreground">
              {run.totals.passed} of {run.totals.total} passed
            </span>
            <span className="text-muted-foreground">
              <Commit commit={run.commit} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The commit a run covered. Linked only when the record names a git object;
 * a run that recorded no commit shows what it recorded rather than a link
 * to a commit page that does not exist.
 */
function Commit({ commit }: { commit: string }) {
  if (!isCommitSha(commit)) return <span className="font-mono">{commit}</span>
  return (
    <a
      className="font-mono text-primary underline underline-offset-2 decoration-primary/40 transition-colors hover:decoration-primary"
      href={`${REPO_URL}/commit/${commit}`}
      rel="noopener noreferrer"
      target="_blank"
    >
      {shortCommit(commit)}
    </a>
  )
}
