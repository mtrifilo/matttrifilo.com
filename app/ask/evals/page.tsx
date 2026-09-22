import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ASSISTANT_EVALS_TITLE } from '@/components/assistant/copy'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import {
  evalHistory,
  isCommitSha,
  shortCommit,
  type EvalRun,
} from '@/lib/evals/results'
import { formatDate } from '@/lib/format-date'

/**
 * The published eval results for Matt's Career Assistant (MTC-44).
 *
 * Static, and read from the files committed under `evals/results/` while the
 * page is prerendered. What it may show is settled: aggregates only, which
 * is why the suite definitions are linked rather than quoted. No question,
 * no answer and no grader rationale appears here, and none is in the record
 * it reads.
 *
 * It lives behind the same kill switch as /ask. An assistant that is not
 * serving has no test results worth publishing, and the link under the chat
 * pane is not rendered either.
 */

const REPO_URL = 'https://github.com/mtrifilo/matttrifilo.com'
const SUITES_URL = `${REPO_URL}/tree/main/evals/suites`

/** How many runs the history shows. Older records stay in the repository. */
const HISTORY_LENGTH = 10

/*
 * Copy, and Matt's to change. The voice is the assistant's: a third party
 * describing how Matt's assistant is checked, never Matt.
 *
 * The reader is a hiring manager with seconds to spend, for whom the
 * assistant is a work sample before it is an information channel, so the
 * first paragraph says what is checked and where the checks live rather than
 * selling the idea of testing. The suite sentences are condensed from
 * docs/career-assistant-operations.md; GRADING_LIMIT says what the numbers
 * do not prove and which suites the caveat applies to.
 */
const PAGE_INTRO =
  "Matt's Career Assistant is checked against a fixed set of recorded questions before a change to its instructions, or to the documents it reads, goes live. Four suites run: whether an answer carries the facts and opened the document they came from, whether it declines what it should decline, whether it holds up against attempts to talk it out of its rules, and whether it names only the documents the server actually read. Every run that ships is published here, with the commit it ran against, and the suites themselves are in the public repository."

/**
 * One sentence per suite, keyed by the name the record carries. A suite with
 * no sentence renders its counts without one; app/ask/evals/suite-notes.test.ts
 * fails when a suite in the repository is missing from this map.
 */
export const SUITE_NOTES: Record<string, string> = {
  golden:
    'Hiring-manager questions. The answer has to carry the distinctive facts, stay in the third person, and have opened the document the fact lives in.',
  refusals:
    "Compensation, employment status, contact details, colleague names, employer internals and opinions. The answer has to be the assistant's decline sentence, compared against the one the live instructions use.",
  injection:
    'Attempts to talk the assistant out of its rules: role-play, encoded or reversed instructions, instructions planted inside a quoted document, and forged earlier turns. The answer has to stay in the third person and give up no policy text or tool name.',
  groundedness:
    'Questions whose sources have to name only the documents the server actually read, and probes for plausible facts that are not in the documents at all and have to be declined rather than invented.',
}

const GRADING_LIMIT =
  'Deterministic checks are the gate in every suite. Two of them, golden and groundedness, add a model grader where a question needs judgement: each of those answers is graded three times and two of the three have to pass, at a threshold of 0.6. Model grading carries noise of its own, and these counts include it.'

const RETRY_NOTE =
  'Retried counts tests whose first attempt was lost to a stalled connection upstream and was sent again, rather than answered badly.'

const NO_RUN_YET = 'No published run yet.'

// A function, not a constant: a static `metadata` export resolves even when
// the page throws notFound(), so the 404 would still carry this title,
// description and a self-canonical, the way app/ask/page.tsx explains.
export function generateMetadata(): Metadata {
  if (isChatDisabled()) notFound()
  return {
    title: ASSISTANT_EVALS_TITLE,
    description:
      "Published results from the suites that check Matt's Career Assistant for accuracy, refusals, injection resistance and groundedness before a change ships.",
    alternates: { canonical: '/ask/evals' },
  }
}

export default function EvalResultsPage() {
  if (isChatDisabled()) notFound()

  // One read of the directory: the newest run heads the history it belongs
  // to, and the page shows it in both places on purpose, as the run being
  // described and as the most recent line of the record.
  const history = evalHistory(HISTORY_LENGTH)
  const latest = history[0] ?? null

  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-12 md:px-8">
        <h1
          className="mb-6 font-bold"
          style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
        >
          {ASSISTANT_EVALS_TITLE}
        </h1>

        <p className="max-w-2xl leading-relaxed text-foreground/90">
          {PAGE_INTRO}
        </p>

        {latest ? (
          <LatestRun run={latest} />
        ) : (
          <p className="mt-8 text-muted-foreground">{NO_RUN_YET}</p>
        )}

        {history.length > 0 && <History runs={history} />}

        <p className="mt-10 text-sm leading-relaxed text-muted-foreground">
          The suites themselves, every question in them and every check they
          make, are in the repository:{' '}
          <a
            className="text-primary underline underline-offset-2 decoration-primary/40 transition-colors hover:decoration-primary"
            href={SUITES_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            evals/suites
          </a>
          .
        </p>
      </div>
    </div>
  )
}

function LatestRun({ run }: { run: EvalRun }) {
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

function History({ runs }: { runs: EvalRun[] }) {
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
