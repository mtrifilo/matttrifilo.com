import { describe, expect, test } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import type { AnswerView } from '@/lib/chat/answer'
import type { ChatProgressStep } from '@/lib/chat/progress'
import { AssistantProgress } from './assistant-progress'
import { progressReading, progressSummary } from './copy'

/**
 * The progress panel once a run has finished (MTC-59).
 *
 * Which of six states a run is in, and what a finished one may claim, are
 * decided in lib/chat/progress.ts and tested there. What only a render shows
 * is the disclosure itself: that the line standing in for the whole run is
 * the line the copy helper writes, and that the steps behind it are folded
 * away until the visitor opens them.
 *
 * The collapsed default is the behaviour worth pinning. The panel is
 * controlled by a state the component derives rather than by Radix's own
 * default, so an edit that inverted it would leave every answer in the
 * transcript under an open list of the documents it read.
 */

const STEPS: ChatProgressStep[] = [
  { id: 'resume', title: 'Résumé' },
  { id: 'email-reliability', title: 'Email Reliability' },
  { id: 'ai-adoption', title: 'AI adoption' },
]

/** A run that read three documents and answered, in 14 seconds. */
function finishedView(
  steps: readonly ChatProgressStep[] = STEPS,
  ms = 14_200
): AnswerView {
  return {
    text: 'An answer drawn from those documents.',
    followUps: [],
    truncated: false,
    incomplete: false,
    progress: { phase: 'done', steps, ms },
  }
}

/** A finished run: nothing is pending, and the clock is the server's. */
function renderFinished(view: AnswerView = finishedView()) {
  return render(<AssistantProgress elapsedMs={0} pending={false} view={view} />)
}

describe('a finished run', () => {
  test('collapses to the line the copy helper writes', () => {
    renderFinished()

    // The whole accessible name, not a substring: the timer and the chevron
    // are hidden from assistive tech, so this is the one line a screen reader
    // reads, and it has to be the sentence copy.ts composed rather than
    // anything the component assembled itself.
    expect(
      screen.getByRole('button', { name: progressSummary(3, 0, 14) })
    ).toBeDefined()
  })

  test('counts the documents and the seconds the run actually took', () => {
    // Three steps, three rows, two documents: a GitHub check is a step but
    // not a source, so a panel that counted its own rows or steps would say
    // three. 14_600 ms rounds to 15s, where truncating would say 14. Both
    // are decided in lib/chat/progress.ts and worded in copy.ts; this is the
    // check that the panel renders their answer.
    const steps: ChatProgressStep[] = [
      ...STEPS.slice(0, 2),
      { id: 'decant', title: 'decant', kind: 'activity' },
    ]
    renderFinished(finishedView(steps, 14_600))

    expect(
      screen.getByRole('button', { name: progressSummary(2, 1, 15) })
    ).toBeDefined()
  })

  test('folds the steps away behind it', () => {
    renderFinished()

    const header = screen.getByRole('button', {
      name: progressSummary(3, 0, 14),
    })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    for (const step of STEPS) {
      expect(screen.queryByText(progressReading(step.title))).toBeNull()
    }
  })

  test('opens them when the visitor asks, and names each document', () => {
    renderFinished()

    const header = screen.getByRole('button', {
      name: progressSummary(3, 0, 14),
    })
    fireEvent.click(header)

    expect(header.getAttribute('aria-expanded')).toBe('true')
    // In the order the server narrated them: the list is an account of the
    // run, so a reordering would misreport it.
    expect(
      screen.getAllByText(/^Reading /).map(row => row.textContent)
    ).toEqual(STEPS.map(step => progressReading(step.title)))
  })
})
