import { describe, expect, test } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import type { AnswerView } from '@/lib/chat/answer'
import { AssistantProgress } from './assistant-progress'
import { progressHeadings, progressSummary } from './copy'

/**
 * What a screen reader, a keyboard and a low-vision visitor meet on the
 * assistant's surfaces, where a render can hold it (MTC-88).
 *
 * The token pairs themselves are computed in lib/theme-contrast.test.ts.
 * This file holds the components to drawing text in those tokens as they
 * are: a class that lowers a text token's opacity makes a new color that no
 * token test ever sees.
 */

/** Any text color class with an opacity modifier, such as `/70`. */
const TEXT_WITH_OPACITY = /(^|\s)text-[a-z-]+\/\d+/

describe('the progress rows', () => {
  test("draw a document's section titles in the muted token, at full strength", () => {
    const headings = ['Summary', 'Experience']
    const view: AnswerView = {
      text: 'An answer.',
      followUps: [],
      truncated: false,
      incomplete: false,
      progress: {
        phase: 'done',
        steps: [{ id: 'resume', title: 'Résumé', topic: 'career', headings }],
        ms: 9_000,
      },
    }
    render(<AssistantProgress elapsedMs={0} pending={false} view={view} />)
    fireEvent.click(
      screen.getByRole('button', { name: progressSummary(1, 0, 9) })
    )

    // At 70 percent the line was 2.7:1 on the light theme and 4.2:1 on the
    // dark one, under the 4.5:1 its 12 px text needs.
    let element: HTMLElement | null = screen.getByText(
      progressHeadings(headings)
    )
    while (element && element.tagName !== 'BODY') {
      expect(element.className).not.toMatch(TEXT_WITH_OPACITY)
      element = element.parentElement
    }
  })
})
