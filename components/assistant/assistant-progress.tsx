'use client'

import {
  Check,
  ChevronDown,
  CircleStop,
  FileText,
  LoaderCircle,
} from 'lucide-react'
import type { AnswerView } from '@/lib/chat/answer'
import {
  progressStatus,
  progressSummary,
  type ChatProgressStep,
  type ProgressView,
} from '@/lib/chat/progress'
import {
  PROGRESS_STOPPED,
  PROGRESS_THINKING,
  PROGRESS_WRITING,
  progressReading,
} from './copy'

/**
 * What the assistant is doing, while it is doing it (MTC-42).
 *
 * The model reads one to three documents before the first token, which is ten
 * to twenty seconds of nothing to look at. This is what fills that gap: a
 * step per document, a line for the answer being written, and a timer. Once
 * the answer is there the whole thing folds into one line, "Read 3 documents
 * in 14s", that can be opened again.
 *
 * Every state it can render is terminal except the three that are genuinely
 * in flight. A run that was cut off shows its steps frozen, with the one that
 * was in progress marked stopped; it never spins, never keeps counting, and
 * never claims a document count. Which state applies is decided in
 * lib/chat/progress.ts, where it is tested; this file only draws them.
 */

export interface AssistantProgressProps {
  view: AnswerView
  /** True between sending and this run ending. */
  pending: boolean
  /**
   * The visitor's own clock, running since the question was sent and frozen
   * when the run ended. A finished run shows the server's duration instead,
   * inside the summary line: that one counts the whole request rather than
   * the part of it this tab happened to be watching.
   */
  elapsedMs: number
}

export function AssistantProgress({
  view,
  pending,
  elapsedMs,
}: AssistantProgressProps) {
  const status = progressStatus(view, pending)
  if (status === 'none') return null

  if (status === 'done') {
    const steps = view.progress?.steps ?? []
    const summary = progressSummary(view)
    // No summary means the run finished but produced no answer for the
    // reading to have gone into. The steps are still true, so they stay on
    // screen: expanded, under the "couldn't finish" notice, claiming
    // nothing about what came of them.
    if (!summary) return <Rows rows={doneRows(steps)} />

    return (
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <FileText aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{summary}</span>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="pt-2">
          <Rows rows={doneRows(steps)} />
        </div>
      </details>
    )
  }

  return (
    <Rows
      rows={liveRows(status === 'stopped', view.progress)}
      // Whole seconds from zero, so the first second reads `0s` rather than
      // rounding a run that has barely started up to one. A finished run's
      // duration is the server's and lives in the summary line instead.
      seconds={pending || elapsedMs > 0 ? Math.round(elapsedMs / 1000) : null}
    />
  )
}

/** One line of the list: an icon, a label, and how far it got. */
interface Row {
  key: string
  label: string
  icon: 'done' | 'active' | 'stopped'
}

/** Every read, finished. What the collapsed summary opens onto. */
function doneRows(steps: readonly ChatProgressStep[]): Row[] {
  return steps.map((step, index) => ({
    key: `${step.id}-${index}`,
    label: progressReading(step.title),
    icon: 'done',
  }))
}

/**
 * The list while the run is going, or frozen at the moment it stopped.
 *
 * The two shapes are the same either way: while reading, the last step is the
 * one in progress and every earlier one is finished; while writing, every
 * read is finished and the answer row is the one in progress. A stopped run
 * kept whichever phase it stopped in, so it is that same list with the row
 * that was in progress marked as the place it stopped, and no spinner on it.
 */
function liveRows(stopped: boolean, progress: ProgressView | undefined): Row[] {
  const steps = progress?.steps ?? []
  const rows =
    steps.length === 0
      ? // Nothing read yet: the model is still choosing what to open.
        [{ key: 'thinking', label: PROGRESS_THINKING, icon: 'active' } as Row]
      : doneRows(steps)

  if (steps.length > 0 && progress?.phase === 'writing') {
    rows.push({ key: 'writing', label: PROGRESS_WRITING, icon: 'active' })
  }

  const current = rows[rows.length - 1]
  current.icon = stopped ? 'stopped' : 'active'
  if (stopped) current.label = `${current.label} · ${PROGRESS_STOPPED}`
  return rows
}

function Rows({ rows, seconds }: { rows: Row[]; seconds?: number | null }) {
  if (rows.length === 0) return null
  return (
    <ul className="space-y-1.5 text-sm text-muted-foreground">
      {rows.map((row, index) => (
        <li className="flex items-center gap-2" key={row.key}>
          <RowIcon icon={row.icon} />
          <span className="min-w-0 truncate">{row.label}</span>
          {/* Hidden from assistive tech: a counter inside the transcript
              would be re-read on every tick. The sr-only status region
              announces the steps instead, without the seconds. */}
          {seconds != null && index === rows.length - 1 && (
            <span aria-hidden="true" className="ml-auto shrink-0 tabular-nums">
              {seconds}s
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function RowIcon({ icon }: { icon: Row['icon'] }) {
  if (icon === 'done') {
    return <Check aria-hidden="true" className="size-3.5 shrink-0" />
  }
  if (icon === 'stopped') {
    return <CircleStop aria-hidden="true" className="size-3.5 shrink-0" />
  }
  return (
    <LoaderCircle
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
    />
  )
}
