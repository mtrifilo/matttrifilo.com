'use client'

import { CircleStop, FileText, LoaderCircle, PenLine } from 'lucide-react'
import { useState } from 'react'
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import type { AnswerView } from '@/lib/chat/answer'
import {
  progressRows,
  progressSeconds,
  progressStatus,
  progressTimerPlacement,
  progressTotals,
  type ProgressRow,
  type ProgressStatus,
} from '@/lib/chat/progress'
import {
  PROGRESS_STOPPED,
  PROGRESS_THINKING,
  PROGRESS_UNFINISHED,
  PROGRESS_WRITING,
  progressReading,
  progressSummary,
} from './copy'

/**
 * What the assistant is doing, while it is doing it.
 *
 * The model reads one to three documents before the first token, which is ten
 * to twenty seconds with nothing to look at. This fills that gap: a headline
 * that tracks the run, a step per document, and a timer. The clock sits on
 * the headline until a document is named, then moves onto the active step
 * so "Working…" does not sit above "Reading Résumé…". Once the answer is
 * there the headline becomes "Read 3 documents in 14s" and the steps fold
 * away behind it.
 *
 * This file draws. It decides nothing: which of six states a run is in, which
 * rows it has, and what the clock reads are all settled in lib/chat/progress,
 * where they are tested without a browser, and every string is in ./copy.
 * Anything here that starts to look like a judgement belongs in one of those.
 */

export interface AssistantProgressProps {
  view: AnswerView
  /** True between sending and this run ending. */
  pending: boolean
  /**
   * The visitor's own clock, running since the question was sent and frozen
   * when the run ended. A finished run shows the server's duration instead,
   * inside the headline. The two do not agree: the server starts counting
   * after it has classified the visitor and read the body, so its number is
   * the smaller one and the header can step back a second when the answer
   * lands. The server's is the one worth keeping, because it is the same
   * number the logs record.
   */
  elapsedMs: number
}

export function AssistantProgress({
  view,
  pending,
  elapsedMs,
}: AssistantProgressProps) {
  // Null until the visitor takes a view of their own, so the panel follows
  // the run and then stops second-guessing them the moment they touch it.
  const [override, setOverride] = useState<boolean | null>(null)

  const status = progressStatus(view, pending)
  if (status === 'none') return null

  const totals = progressTotals(view)
  const summary = totals
    ? progressSummary(totals.count, totals.seconds)
    : undefined
  const rows = progressRows(status, view.progress)
  const seconds = progressSeconds(pending, elapsedMs)
  const clock =
    summary || seconds === undefined ? undefined : `${seconds}s`
  const timerOnStep = progressTimerPlacement(rows) === 'step'
  const headerLabel = summary ?? headline(status, rows)

  return (
    <ChainOfThought
      onOpenChange={setOverride}
      // Shut once there is a summary standing in for the steps, open every
      // other time there is something to say: while the run works, after one
      // that was cut off, and after one that finished without an answer,
      // where the steps are all the account there is.
      open={override ?? summary === undefined}
    >
      {headerLabel !== null && (
        <ChainOfThoughtHeader
          // Nothing has been read yet, so there is nothing to open.
          disabled={rows.length === 0}
          icon={<HeadlineIcon status={status} />}
          timer={timerOnStep ? undefined : clock}
        >
          {headerLabel}
        </ChainOfThoughtHeader>
      )}
      {/* Always rendered, even with no steps to put in it: Radix stamps the
          region's id on the trigger as `aria-controls`, and an open trigger
          pointing at an element that is not in the document is the defect
          the component's single Collapsible root exists to avoid. When the
          header is omitted (documents are being read), this region is the
          whole account and stays open. */}
      <ChainOfThoughtContent>
        {rows.map(row => (
          <ChainOfThoughtStep
            icon={rowIcon(row)}
            key={row.key}
            label={label(row)}
            status={row.state}
            timer={
              timerOnStep &&
              (row.state === 'active' || row.state === 'stopped')
                ? clock
                : undefined
            }
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}

/**
 * A row in flight spins; one that stopped says so; a finished one shows what
 * it was, a document or the answer.
 */
function rowIcon(row: ProgressRow) {
  if (row.state === 'active') return LoaderCircle
  if (row.state === 'stopped') return CircleStop
  return row.title === undefined ? PenLine : FileText
}

/** A read row names its document; the writing row names the answer. */
function label(row: ProgressRow): string {
  return row.title === undefined ? PROGRESS_WRITING : progressReading(row.title)
}

/**
 * The headline while a run is in flight, or once it ended without one.
 *
 * `null` while documents are being read or the answer written: the active
 * row already names the work, and a second "Working…" above it is the
 * duplicate.
 */
function headline(
  status: ProgressStatus,
  rows: readonly ProgressRow[]
): string | null {
  if (status === 'stopped') return PROGRESS_STOPPED
  if (status === 'done') return PROGRESS_UNFINISHED
  if (status === 'thinking' || rows.length === 0) return PROGRESS_THINKING
  return null
}

/**
 * The one thing that moves while the model works, before any step exists.
 *
 * Once a row is active the spinner lives on that row, so this is only drawn
 * on the header.
 */
function HeadlineIcon({ status }: { status: ProgressStatus }) {
  if (status === 'stopped') return <CircleStop className="size-4 shrink-0" />
  if (status === 'done') return <FileText className="size-4 shrink-0" />
  // Every remaining status is a run still working.
  return (
    <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
  )
}
