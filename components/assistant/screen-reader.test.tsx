import { afterEach, describe, expect, test } from 'bun:test'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { answered, openStream, type OpenStream } from '@/test/chat-stream'
import { AssistantChat } from './assistant-chat'
import { INCOMPLETE_NOTICE, TRUNCATED_NOTICE } from './copy'

/**
 * What a screen reader is told while an answer arrives (MTC-88).
 *
 * The transcript is deliberately not a live region, so a streamed answer is
 * never read token by token; the visually hidden status region says what the
 * run is doing instead. These tests hold both halves: the region changes
 * once per step however many tokens arrive, it never rewrites itself with
 * the words it already holds (a replaced node is read again), and nothing
 * around the answer is live. What VoiceOver then speaks, and when, is the
 * hand check the runbook's "Accessibility and performance" section lists.
 */

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

async function send(stream: OpenStream, ...chunks: unknown[]): Promise<void> {
  await act(async () => {
    for (const chunk of chunks) stream.push(chunk)
  })
}

const LIVE =
  '[aria-live], [role="log"], [role="status"], [role="alert"], [role="marquee"], [role="timer"]'

const TOKENS = Array.from({ length: 40 }, (_, index) => `word${index} `)
const STEPS = [{ id: 'resume', title: 'Résumé' }]

/**
 * One run as the route streams it: a read, the writing step, forty tokens,
 * and the `done` part the route sends just before `finish`. Returns every
 * text the status region was given, one entry per change a screen reader
 * could be told about, and how many of those landed among the tokens.
 */
async function streamOneAnswer(): Promise<{
  said: string[]
  amongTokens: number
}> {
  const stream = openStream()
  stubRoute(() => stream.response)
  render(<AssistantChat />)
  const status = screen.getByRole('status')
  const said: string[] = []
  const observer = new MutationObserver(() => {
    said.push(status.textContent ?? '')
  })
  observer.observe(status, {
    characterData: true,
    childList: true,
    subtree: true,
  })

  ask('Who is Matt?')
  await waitFor(() => expect(status.textContent).toBe('Responding'))
  await send(
    stream,
    { type: 'start' },
    {
      type: 'data-progress',
      id: 'progress',
      data: { phase: 'reading', steps: STEPS },
    }
  )
  await waitFor(() => expect(status.textContent).toBe('Reading Résumé'))
  await send(stream, {
    type: 'data-progress',
    id: 'progress',
    data: { phase: 'writing', steps: STEPS },
  })
  await waitFor(() => expect(status.textContent).toBe('Writing answer'))

  const beforeTokens = said.length
  await send(stream, { type: 'text-start', id: 't' })
  for (const delta of TOKENS) {
    await send(stream, { type: 'text-delta', id: 't', delta })
  }
  await waitFor(() => screen.getByText(/word39/))
  const amongTokens = said.length - beforeTokens

  await send(
    stream,
    { type: 'text-end', id: 't' },
    {
      type: 'data-progress',
      id: 'progress',
      data: { phase: 'done', steps: STEPS, ms: 9_000 },
    },
    { type: 'finish' }
  )
  await act(async () => stream.close())
  await waitFor(() => expect(status.textContent).toBe('Response complete'))
  observer.disconnect()
  return { said, amongTokens }
}

describe('a streamed answer', () => {
  test('leaves the status region alone while its tokens arrive', async () => {
    const { amongTokens } = await streamOneAnswer()
    expect(amongTokens).toBe(0)
  })

  test('moves the status region once per step, never to the words it holds', async () => {
    const { said } = await streamOneAnswer()
    expect(said.slice(0, 3)).toEqual([
      'Responding',
      'Reading Résumé',
      'Writing answer',
    ])
    expect(said.at(-1)).toBe('Response complete')
    const repeats = said.filter((text, index) => text === said[index - 1])
    expect(repeats).toEqual([])
  })

  // The route sends the `done` part just before `finish`, and the stream
  // closes a moment after. In that gap the region keeps the step it last
  // named: "Responding" there would tell a screen reader the run had
  // started over, just before "Response complete".
  test('goes straight from the last step to "Response complete"', async () => {
    const { said } = await streamOneAnswer()
    expect(said).toEqual([
      'Responding',
      'Reading Résumé',
      'Writing answer',
      'Response complete',
    ])
  })

  test('sits in no live region, so the answer is never read as it grows', async () => {
    stubRoute(() =>
      answered([
        { type: 'start' },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Matt led the platform team.' },
        { type: 'text-end', id: 't' },
        { type: 'finish' },
      ])
    )
    render(<AssistantChat />)
    ask('Who is Matt?')
    const answer = await waitFor(() =>
      screen.getByText('Matt led the platform team.')
    )
    expect(answer.closest(LIVE)).toBeNull()
    expect(answer.closest('[aria-atomic]')).toBeNull()
  })
})

describe('an answer that did not end cleanly', () => {
  // The region speaks the notice's own words in place of "Response
  // complete" (Matt, 2026-09-30, MTC-102), so a reader who cannot see the
  // notice is told what it says, once.
  async function endWith(chunks: unknown[]): Promise<{
    said: string[]
    status: HTMLElement
  }> {
    stubRoute(() => answered(chunks))
    render(<AssistantChat />)
    const status = screen.getByRole('status')
    const said: string[] = []
    const observer = new MutationObserver(() => {
      said.push(status.textContent ?? '')
    })
    observer.observe(status, {
      characterData: true,
      childList: true,
      subtree: true,
    })
    ask('Who is Matt?')
    await waitFor(() => expect(status.textContent).not.toBe('Responding'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send question' })).toBeTruthy()
    )
    observer.disconnect()
    return { said, status }
  }

  /** The notice drawn under the answer, as opposed to the status region. */
  function visibleNotice(words: string): HTMLElement | undefined {
    return screen
      .getAllByText(words)
      .find(element => element.closest('[role="status"]') === null)
  }

  test('a cut-short answer is announced in the words of its notice', async () => {
    const { said, status } = await endWith([
      { type: 'start' },
      {
        type: 'data-progress',
        id: 'progress',
        data: { phase: 'writing', steps: STEPS },
      },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'Matt led the platform team and' },
      { type: 'text-end', id: 't' },
      {
        type: 'data-progress',
        id: 'progress',
        data: { phase: 'done', steps: STEPS, ms: 9_000 },
      },
      {
        type: 'finish',
        messageMetadata: { truncated: true, incomplete: true },
      },
    ])
    await waitFor(() => expect(status.textContent).toBe(TRUNCATED_NOTICE))
    expect(visibleNotice(TRUNCATED_NOTICE)).toBeDefined()
    expect(said).not.toContain('Response complete')
    expect(said.slice(1)).not.toContain('Responding')
    expect(said.filter(text => text === TRUNCATED_NOTICE)).toHaveLength(1)
  })

  test('a run with no answer is announced in the words of its notice', async () => {
    const { said, status } = await endWith([
      { type: 'start' },
      {
        type: 'data-progress',
        id: 'progress',
        data: { phase: 'reading', steps: STEPS },
      },
      {
        type: 'data-progress',
        id: 'progress',
        data: { phase: 'done', steps: STEPS, ms: 9_000 },
      },
      { type: 'finish', messageMetadata: { incomplete: true } },
    ])
    await waitFor(() => expect(status.textContent).toBe(INCOMPLETE_NOTICE))
    expect(visibleNotice(INCOMPLETE_NOTICE)).toBeDefined()
    expect(said).not.toContain('Response complete')
    expect(said.slice(1)).not.toContain('Responding')
  })
})

describe('the answer actions', () => {
  test('say "Copied" once, politely, when the answer is copied', async () => {
    const written: string[] = []
    const clipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      },
    })
    try {
      stubRoute(() =>
        answered([
          { type: 'start' },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'An answer.' },
          { type: 'text-end', id: 't' },
          { type: 'finish' },
        ])
      )
      render(<AssistantChat />)
      ask('Who is Matt?')
      const copy = await waitFor(() =>
        screen.getByRole('button', { name: 'Copy' })
      )
      // The region is in the page, empty, before anything is copied: one
      // added with its text already in it is not reliably announced.
      const region = copy.parentElement!.querySelector('[aria-live]')!
      expect(region.getAttribute('aria-live')).toBe('polite')
      expect(region.textContent).toBe('')

      fireEvent.click(copy)
      await waitFor(() => expect(region.textContent).toBe('Copied'))
      expect(written).toEqual(['An answer.'])
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: clipboard,
      })
    }
  })
})
