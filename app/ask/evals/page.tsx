import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ASSISTANT_EVALS_TITLE } from '@/components/assistant/copy'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { evalHistory } from '@/lib/evals/results'
import { History, LatestRun } from './run-report'

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

const SUITES_URL =
  'https://github.com/mtrifilo/matttrifilo.com/tree/main/evals/suites'

/** How many runs the history shows. Older records stay in the repository. */
const HISTORY_LENGTH = 10

/*
 * Copy, and Matt's to change. The voice is the assistant's: a third party
 * describing how Matt's assistant is checked, never Matt.
 *
 * The reader is a hiring manager with seconds to spend, for whom the
 * assistant is a work sample before it is an information channel, so the
 * first paragraph says what is checked and where the checks live rather than
 * selling the idea of testing. It claims nothing about how many runs there
 * are or how often they happen: what reaches this page is what someone
 * published, and the page below says how much that is.
 */
const PAGE_INTRO =
  "Matt's Career Assistant is checked against a fixed set of recorded questions before a change to its instructions, or to the documents it reads, goes live. The suites check whether an answer carries the facts and opened the document they came from, whether it declines what it should decline, whether it holds up against attempts to talk it out of its rules, and whether it names only the documents the server actually read. A run is published here as it was recorded, with the commit it ran against, and the suites themselves are in the public repository."

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
  // to, and is described in full above it.
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

        {/* Only once there is something to compare: with one record the
            list would repeat the run described above it, word for word. */}
        {history.length > 1 && <History runs={history} />}

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
