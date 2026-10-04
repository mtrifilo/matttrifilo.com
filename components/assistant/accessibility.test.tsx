import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessageResponse } from '@/components/ai-elements/message'
import { DECLINE_SENTENCE, type AnswerView } from '@/lib/chat/answer'
import { repositoryDeclineSentence } from '@/lib/chat/prompt'
import { ASSISTANT_REPOSITORIES } from '@/lib/chat/repositories'
import { answered, openStream } from '@/test/chat-stream'
import { AssistantChat } from './assistant-chat'
import { AssistantDisclosure } from './assistant-disclosure'
import { AssistantProgress } from './assistant-progress'
import { EvalsPublishedProvider } from './evals-published'
import {
  ASSISTANT_EVALS_TITLE,
  ASSISTANT_HOW_BUILT_TEXT,
  progressHeadings,
  progressSummary,
  RESET_LABEL,
  seeAllQuestionsLabel,
  STARTER_QUESTIONS,
} from './copy'

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

const COMPOSER = "Ask a question about Matt's work"
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  sessionStorage.clear()
})

function stubRoute(response: () => Response): void {
  globalThis.fetch = (() =>
    Promise.resolve(response())) as unknown as typeof fetch
}

function ask(question: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: COMPOSER }), {
    target: { value: question },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
}

/**
 * Whether a control carries the 44 px hit area, and is positioned so the
 * area centres on it (app/globals.css, `.touch-target`).
 */
function hasTouchTarget(element: HTMLElement): boolean {
  const classes = element.className.split(/\s+/)
  return (
    classes.includes('touch-target') &&
    (classes.includes('relative') || classes.includes('absolute'))
  )
}

describe('controls drawn under 44 px', () => {
  // The pills are 46 px tall on their own (12 px padding around a 20 px
  // line, plus the border), so they need no help. Links inside a sentence
  // are exempt (WCAG 2.5.8) and would overlap the next line's if grown.
  test('carry a 44 px hit area once an answer is in', async () => {
    stubRoute(() =>
      answered([
        { type: 'start' },
        {
          type: 'data-progress',
          id: 'progress',
          data: {
            phase: 'done',
            steps: [{ id: 'resume', title: 'Résumé' }],
            ms: 9_000,
          },
        },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'An answer.' },
        { type: 'text-end', id: 't' },
        { type: 'finish' },
      ])
    )
    render(<AssistantChat />)
    ask('Who is Matt?')
    await waitFor(() => screen.getByRole('button', { name: 'Copy' }))
    fireEvent.change(screen.getByRole('textbox', { name: COMPOSER }), {
      target: { value: 'A next question' },
    })

    const small = [
      RESET_LABEL,
      progressSummary(1, 0, 9),
      'Copy',
      'Regenerate',
      'Send question',
    ].map(name => screen.getByRole('button', { name }))
    expect(small.filter(control => !hasTouchTarget(control))).toEqual([])
  })

  test('carry it on the empty page and while an answer is arriving', async () => {
    const stream = openStream()
    stubRoute(() => stream.response)
    render(<AssistantChat />)
    expect(
      hasTouchTarget(
        screen.getByRole('button', {
          name: seeAllQuestionsLabel(STARTER_QUESTIONS.length),
        })
      )
    ).toBe(true)

    ask('Who is Matt?')
    const stop = await waitFor(() =>
      screen.getByRole('button', { name: 'Stop generating' })
    )
    expect(hasTouchTarget(stop)).toBe(true)
    await act(async () => {
      stream.push({ type: 'start' })
      stream.push({ type: 'finish' })
      stream.close()
    })
    await waitFor(() => screen.getByRole('button', { name: 'Send question' }))
  })

  test('carry it on "Jump to latest", which floats and so stays absolute', () => {
    // It only renders once the transcript is scrolled away from the bottom,
    // which Happy DOM cannot lay out, so its classes are read from source.
    const source = readFileSync(
      new URL('../ai-elements/conversation.tsx', import.meta.url),
      'utf8'
    )
    expect(source).toContain('"touch-target absolute ')
  })

  test('carry it on the eval results and how-it-was-built links, which stand on a line of their own', () => {
    render(
      <EvalsPublishedProvider published>
        <AssistantDisclosure />
      </EvalsPublishedProvider>
    )
    expect(
      hasTouchTarget(screen.getByRole('link', { name: ASSISTANT_EVALS_TITLE }))
    ).toBe(true)
    expect(
      hasTouchTarget(
        screen.getByRole('link', { name: ASSISTANT_HOW_BUILT_TEXT })
      )
    ).toBe(true)
    // "Matt himself" sits inside a sentence: exempt, and a grown area there
    // would reach the line below.
    expect(
      hasTouchTarget(screen.getByRole('link', { name: 'Matt himself' }))
    ).toBe(false)
  })
})

describe('a link inside an answer', () => {
  // Streamdown's link check is off (Matt, 2026-09-30, MTC-102): its overlay
  // has no dialog role or label and takes no focus. A link is a plain
  // new-tab link.
  const REPOSITORY = 'https://github.com/mtrifilo/matttrifilo.com'

  test('is a plain link that opens in a new tab, with no overlay', () => {
    const { container } = render(
      <MessageResponse>{`See [the repository](${REPOSITORY}).`}</MessageResponse>
    )
    const link = screen.getByRole('link', { name: 'the repository' })
    expect(link.getAttribute('href')).toBe(REPOSITORY)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')?.split(' ')).toContain('noopener')
    expect(screen.queryByRole('button')).toBeNull()

    const before = container.innerHTML
    fireEvent.click(link)
    expect(container.innerHTML).toBe(before)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test.each(
    ASSISTANT_REPOSITORIES.map(repository => [repository.id, repository])
  )(
    "the bare URL in a decline about %s is a link to the repository, without the sentence's period",
    (_id, repository) => {
      // The link sentence carries a bare URL (MTC-115), so the link is the
      // renderer's own: the closing period must not become part of it.
      render(
        <MessageResponse>{`${DECLINE_SENTENCE} ${repositoryDeclineSentence(repository)}`}</MessageResponse>
      )
      const link = screen.getByRole('link', { name: repository.url })
      expect(link.getAttribute('href')).toBe(repository.url)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')?.split(' ')).toContain('noopener')
    }
  )

  test('is drawn as its text until its URL has arrived', () => {
    // Mid-stream, or in an answer cut short by the output cap, Streamdown
    // would otherwise link the text to a placeholder URL.
    render(
      <MessageResponse>{`See [the repository](${REPOSITORY.slice(0, 20)}`}</MessageResponse>
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/the repository/)).toBeTruthy()
  })
})
