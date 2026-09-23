import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { setTouchDevice } from '@/test/touch-device'
import { AssistantChat } from './assistant-chat'
import { STARTER_QUESTIONS } from './copy'
import { handOffQuestion } from './pending-question'

/**
 * Where focus lands on /ask: on load, on arrival from the homepage, and after
 * a question is asked.
 *
 * A focused composer is a raised keyboard on a phone, so every path that
 * focuses it has a touch counterpart that does not. What a phone then draws
 * (the keyboard staying down, the answer visible while it streams) is a
 * preview check; what is asserted here is which element holds focus.
 *
 * A touch device is stated through Happy DOM's settings (test/touch-device.ts).
 */

const ANSWER = 'Matt led the platform team.'
const FOLLOW_UP = 'What did the platform team ship next?'

/** Each request's question, in order, as the route would have received it. */
let asked: string[] = []
const realFetch = globalThis.fetch

/**
 * The route, answering every question at once with a one-line answer and one
 * follow-up, so a run ends and the follow-up row can be drawn.
 */
function answeringFetch(input: RequestInfo | URL, init?: RequestInit) {
  const body = JSON.parse(String(init?.body)) as {
    messages: { role: string; parts: { type: string; text?: string }[] }[]
  }
  const last = body.messages.at(-1)
  asked.push(last?.parts.find(part => part.type === 'text')?.text ?? '')
  const chunks = [
    { type: 'start', messageMetadata: { followUps: [FOLLOW_UP] } },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: ANSWER },
    { type: 'text-end', id: 't' },
    { type: 'finish' },
  ]
  const stream = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
  return Promise.resolve(
    new Response(`${stream.join('')}data: [DONE]\n\n`, {
      headers: {
        'content-type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
    })
  )
}

beforeEach(() => {
  asked = []
  sessionStorage.clear()
  globalThis.fetch = answeringFetch as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  sessionStorage.clear()
  setTouchDevice(false)
})

function composer(): HTMLElement {
  return screen.getByRole('textbox', {
    name: "Ask a question about Matt's work",
  })
}

function statusRegion(): HTMLElement {
  return screen.getByRole('status')
}

/**
 * What holds focus, by name. Compared as a string because a failed `toBe` on
 * two elements makes the runner diff the whole document, which takes
 * minutes.
 */
function focused(): string {
  const active = document.activeElement
  if (active === null || active === document.body) return 'nothing'
  if (active === composer()) return 'composer'
  if (active === statusRegion()) return 'status region'
  return `another element (${active.tagName.toLowerCase()})`
}

/**
 * Resolves once the status region holds focus. A touch pick focuses it when
 * the run has started, which the SDK reports a few microtasks after the
 * click, so this waits rather than reading focus straight after it.
 */
async function statusFocused(): Promise<void> {
  await waitFor(() => expect(focused()).toBe('status region'))
}

/** The announced copy of a starter pill; the decorative copies are hidden. */
function starterPill(): HTMLElement {
  return screen.getByRole('button', { name: STARTER_QUESTIONS[0] })
}

/**
 * Resolves once the run in flight has ended and the page is ready again,
 * which is when the last answer's follow-up row is drawn.
 */
async function answered(): Promise<void> {
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: FOLLOW_UP })).not.toBeNull()
  )
}

describe('on load', () => {
  test('focuses the composer with a fine pointer', () => {
    render(<AssistantChat />)
    expect(focused()).toBe('composer')
  })

  test('focuses nothing on a touch device, so the keyboard stays down', () => {
    setTouchDevice(true)
    render(<AssistantChat />)
    expect(focused()).toBe('nothing')
  })
})

describe('a starter question picked on /ask', () => {
  test('returns focus to the composer after a mouse pick', async () => {
    render(<AssistantChat />)
    fireEvent.pointerDown(starterPill(), { pointerType: 'mouse' })
    fireEvent.click(starterPill())
    expect(focused()).toBe('composer')
    await answered()
    expect(asked).toEqual([STARTER_QUESTIONS[0]])
  })

  test('returns focus to the composer after a keyboard pick', async () => {
    render(<AssistantChat />)
    fireEvent.keyDown(starterPill(), { key: 'Enter' })
    fireEvent.click(starterPill())
    expect(focused()).toBe('composer')
    await answered()
  })

  test('moves focus to the status region after a touch pick', async () => {
    setTouchDevice(true)
    render(<AssistantChat />)
    fireEvent.pointerDown(starterPill(), { pointerType: 'touch' })
    fireEvent.click(starterPill())
    await statusFocused()
    await answered()
    await statusFocused()
    expect(asked).toEqual([STARTER_QUESTIONS[0]])
  })

  test('moves focus to the status region on a touch device when a click comes with no press', async () => {
    // A screen reader's activation can be a bare click; the device decides.
    setTouchDevice(true)
    render(<AssistantChat />)
    fireEvent.click(starterPill())
    await statusFocused()
    await answered()
  })

  test('treats a tap on a fine-pointer touchscreen as a touch', async () => {
    render(<AssistantChat />)
    fireEvent.pointerDown(starterPill(), { pointerType: 'touch' })
    fireEvent.click(starterPill())
    await statusFocused()
    await answered()
  })

  test('takes focus off a composer the visitor had been typing in', async () => {
    // Blurring the composer is what puts a keyboard that was already up
    // back down.
    setTouchDevice(true)
    render(<AssistantChat />)
    act(() => composer().focus())
    fireEvent.pointerDown(starterPill(), { pointerType: 'touch' })
    fireEvent.click(starterPill())
    await statusFocused()
    await answered()
  })
})

describe('the status region', () => {
  test('is focusable by script and never in the tab order', () => {
    render(<AssistantChat />)
    expect(statusRegion().getAttribute('tabindex')).toBe('-1')
  })
})

describe('a follow-up picked under an answer', () => {
  async function renderAnswered(): Promise<void> {
    render(<AssistantChat />)
    fireEvent.change(composer(), { target: { value: 'What did Matt ship?' } })
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await answered()
  }

  function followUpPill(): HTMLElement {
    return screen.getByRole('button', { name: FOLLOW_UP })
  }

  /** Resolves once the second answer has been drawn and its run has ended. */
  async function answeredAgain(): Promise<void> {
    await waitFor(() => expect(screen.getAllByText(ANSWER)).toHaveLength(2))
    await answered()
  }

  test('returns focus to the composer after a mouse pick', async () => {
    await renderAnswered()
    fireEvent.pointerDown(followUpPill(), { pointerType: 'mouse' })
    fireEvent.click(followUpPill())
    expect(focused()).toBe('composer')
    await answeredAgain()
    expect(asked).toEqual(['What did Matt ship?', FOLLOW_UP])
  })

  test('moves focus to the status region after a touch pick', async () => {
    setTouchDevice(true)
    await renderAnswered()
    fireEvent.pointerDown(followUpPill(), { pointerType: 'touch' })
    fireEvent.click(followUpPill())
    await statusFocused()
    await answeredAgain()
    expect(asked).toEqual(['What did Matt ship?', FOLLOW_UP])
  })

  test('gives the status region focus only once it no longer reports the last run', async () => {
    // A screen reader reads a region as it takes focus. Taking it while the
    // region still held the previous run's announcement would report the
    // new question as already answered.
    setTouchDevice(true)
    await renderAnswered()
    expect(statusRegion().textContent).toBe('Response complete')
    let readOnFocus: string | null = null
    statusRegion().addEventListener('focus', () => {
      readOnFocus = statusRegion().textContent
    })
    fireEvent.pointerDown(followUpPill(), { pointerType: 'touch' })
    fireEvent.click(followUpPill())
    await waitFor(() => expect(readOnFocus).toBe('Responding'))
    await answeredAgain()
  })
})

describe('a typed question', () => {
  test('keeps focus in the composer on a touch device', async () => {
    // The keyboard is already up for typing; sending does not move focus.
    setTouchDevice(true)
    render(<AssistantChat />)
    act(() => composer().focus())
    fireEvent.change(composer(), { target: { value: 'What did Matt ship?' } })
    fireEvent.keyDown(composer(), { key: 'Enter' })
    expect(focused()).toBe('composer')
    await answered()
    expect(asked).toEqual(['What did Matt ship?'])
  })
})

describe('a question handed over from the homepage', () => {
  test('lands on the status region when it was picked by touch', async () => {
    setTouchDevice(true)
    handOffQuestion({ question: STARTER_QUESTIONS[0], pickedByTouch: true })
    render(<AssistantChat />)
    await statusFocused()
    await answered()
    expect(asked).toEqual([STARTER_QUESTIONS[0]])
  })

  test('lands on the status region after a tap on a fine-pointer touchscreen', async () => {
    handOffQuestion({ question: STARTER_QUESTIONS[0], pickedByTouch: true })
    render(<AssistantChat />)
    await statusFocused()
    await answered()
  })

  test('lands on the composer when it was picked with a mouse or a key', async () => {
    handOffQuestion({ question: STARTER_QUESTIONS[0], pickedByTouch: false })
    render(<AssistantChat />)
    expect(focused()).toBe('composer')
    await answered()
  })

  test('focuses nothing on a touch device when it was typed', async () => {
    setTouchDevice(true)
    handOffQuestion({ question: 'What did Matt ship?', pickedByTouch: false })
    render(<AssistantChat />)
    expect(focused()).toBe('nothing')
    await answered()
    expect(asked).toEqual(['What did Matt ship?'])
  })
})
