'use client'

import {
  CircleStop,
  FileText,
  LoaderCircle,
  PenLine,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import type { AnswerView } from '@/lib/chat/answer'
import {
  progressStatus,
  progressTotals,
  type ChatProgressStep,
  type ProgressStatus,
  type ProgressView,
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
 * that tracks the run, a step per document, and a timer. Once the answer is
 * there the headline becomes "Read 3 documents in 14s" and the steps fold
 * away behind it.
 *
 * This file is only the mapping. Which of six states a run is in is decided
 * in lib/chat/progress.ts, where it is tested; every string is in ./copy;
 * the markup is the vendored ChainOfThought component. Nothing here should
 * grow a second opinion about any of the three.
 *
 * The honest states are the ones worth naming: a run that was cut off shows
 * its steps frozen with the one in flight marked stopped, and a run that
 * finished without writing an answer shows its steps under a headline that
 * claims nothing. Neither spins, and neither counts documents.
 */

export interface AssistantProgressProps {
  view: AnswerView
  /** True between sending and this run ending. */
  pending: boolean
  /**
   * The visitor's own clock, running since the question was sent and frozen
   * when the run ended. A finished run shows the server's duration instead,
   * inside the headline: that one counts the whole request rather than the
   * part of it this tab happened to be watching.
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
  const rows = rowsFor(status, view.progress)
  const summary = totals
    ? progressSummary(totals.count, totals.seconds)
    : undefined

  return (
    <ChainOfThought
      onOpenChange={setOverride}
      // Shut once there is a summary standing in for the steps, open every
      // other time there is something to say: while the run works, after one
      // that was cut off, and after one that finished without an answer,
      // where the steps are all the account there is.
      open={override ?? summary === undefined}
    >
      <ChainOfThoughtHeader
        // Nothing has been read yet, so there is nothing to open.
        disabled={rows.length === 0}
        timer={summary ? undefined : timerFor(pending, elapsedMs)}
      >
        {summary ?? headlineFor(status, rows)}
      </ChainOfThoughtHeader>
      {rows.length > 0 && (
        <ChainOfThoughtContent>
          {rows.map(row => (
            <ChainOfThoughtStep
              icon={row.icon}
              key={row.key}
              label={row.label}
              status={row.status}
            />
          ))}
        </ChainOfThoughtContent>
      )}
    </ChainOfThought>
  )
}

/** One step of the run, as the vendored component wants it. */
interface Row {
  key: string
  label: string
  icon: LucideIcon
  status: 'complete' | 'active' | 'stopped'
}

/**
 * The steps, and which one the run is on.
 *
 * While reading, the last document is in flight and every earlier one is
 * done. While writing, every read is done and the answer row is in flight. A
 * stopped run kept whichever phase it stopped in, so it is the same list with
 * the row that was in flight marked as the place it stopped.
 */
function rowsFor(status: ProgressStatus, progress: ProgressView | undefined) {
  const steps = progress?.steps ?? []
  const rows: Row[] = steps.map(readRow)
  if (rows.length === 0) return rows

  const writing = progress?.phase === 'writing'
  if (writing) {
    rows.push({
      key: 'writing',
      label: PROGRESS_WRITING,
      icon: PenLine,
      status: 'complete',
    })
  }
  if (status === 'done') return rows

  const current = rows[rows.length - 1]
  const stopped = status === 'stopped'
  current.icon = stopped ? CircleStop : LoaderCircle
  current.status = stopped ? 'stopped' : 'active'
  return rows
}

function readRow(step: ChatProgressStep, index: number): Row {
  return {
    key: `${step.id}-${index}`,
    label: progressReading(step.title),
    icon: FileText,
    status: 'complete',
  }
}

/** The headline while a run is in flight, or once it ended without one. */
function headlineFor(status: ProgressStatus, rows: readonly Row[]): string {
  if (status === 'stopped') return PROGRESS_STOPPED
  if (status === 'done') return PROGRESS_UNFINISHED
  if (status === 'writing') return PROGRESS_WRITING
  return rows.length > 0 ? rows[rows.length - 1].label : PROGRESS_THINKING
}

/**
 * Whole seconds from zero, so the first second reads `0s` rather than
 * rounding a run that has barely started up to one. Absent for an older
 * answer in the transcript, whose clock this tab is no longer keeping.
 */
function timerFor(pending: boolean, elapsedMs: number): string | undefined {
  if (!pending && elapsedMs <= 0) return undefined
  return `${Math.round(elapsedMs / 1000)}s`
}
