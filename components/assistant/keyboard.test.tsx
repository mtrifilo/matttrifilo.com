import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { FOCUS_RING } from '@/lib/focus-ring'
import { AssistantChat } from './assistant-chat'
import {
  progressSummary,
  RESET_LABEL,
  seeAllQuestionsLabel,
  SHOW_FEWER_LABEL,
  STARTER_QUESTIONS,
} from './copy'
import {
  RoutedHomeAssistantPanel,
  type PanelRouter,
} from './home-assistant-panel'
import { tickerRows } from './ticker-geometry'

/**
 * The keyboard's path through the assistant (MTC-88): which stops Tab
 * meets and in what order, that every stop draws a focus indicator, and
 * that no stop keeps Tab or Escape to itself.
 *
 * Happy DOM does not move focus on Tab, so the order is read the way a
 * browser computes it for a page with no positive tabindex: every focusable,
 * enabled element whose tabindex is not negative, in document order. The
 * indicator is asserted as the classes that draw it, because Happy DOM never
 * loads the stylesheet; that those classes clear 3:1 is
 * lib/theme-contrast.test.ts. The nav above both surfaces belongs to the
 * layout and is not rendered here.
 */

const ANSWER = 'Matt led the platform team. See [the résumé](/resume).'
const FOLLOW_UP = 'What did the platform team ship next?'
const COMPOSER = "Ask a question about Matt's work"
const realFetch = globalThis.fetch

/**
 * The route, answering at once: one document read, a linked answer and one
 * follow-up.
 */
function answeringFetch() {
  const chunks = [
    { type: 'start', messageMetadata: { followUps: [FOLLOW_UP] } },
    {
      type: 'data-progress',
      id: 'progress',
      data: {
        phase: 'done',
        steps: [{ id: 'resume', title: 'Résumé' }],
        ms: 14_000,
      },
    },
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
  sessionStorage.clear()
  globalThis.fetch = answeringFetch as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  sessionStorage.clear()
})

const router: PanelRouter = { push: () => {}, prefetch: () => {} }

/** The announced copy of each ticker row, in the order the rows render. */
const ROW_QUESTIONS = tickerRows(STARTER_QUESTIONS).flat()

const FOCUSABLE =
  'a[href], button, textarea, input, select, [tabindex], [contenteditable="true"]'

/** What Tab visits, in order, with no positive tabindex on the page. */
function tabStops(root: ParentNode = document.body): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    element =>
      element.tabIndex >= 0 &&
      !(element as HTMLButtonElement).disabled &&
      element.closest('[hidden]') === null
  )
}

/** A stop by the name a screen reader would give it. */
function nameOf(element: HTMLElement): string {
  return (
    element.getAttribute('aria-label') ??
    element.textContent?.replace(/\s+/g, ' ').trim() ??
    ''
  )
}

/**
 * Whether the element draws a keyboard focus indicator of its own, or sits
 * where one is drawn for it.
 */
function focusIndicatorOf(element: HTMLElement): string | null {
  const classes = element.className
  if (FOCUS_RING.split(' ').every(name => classes.includes(name)))
    return 'outline'
  // components/ui/button.tsx: a border in the ring token plus a halo.
  if (
    classes.includes('focus-visible:border-ring') &&
    classes.includes('focus-visible:ring-')
  )
    return 'button ring'
  // The composer's field: its form draws the ring token on focus within.
  if (element.tagName === 'TEXTAREA') {
    const form = element.closest('form')
    if (form?.className.includes('focus-within:border-ring')) return 'form'
  }
  // A link inside an answer: the answer's wrapper styles it.
  if (element.dataset.streamdown === 'link') {
    const wrapper = element.closest(
      '[class*="[&_[data-streamdown=link]:focus-visible]:outline-2"]'
    )
    if (wrapper) return 'answer link'
  }
  return null
}

function expectEveryStopToShowFocus(stops: readonly HTMLElement[]): void {
  const bare = stops
    .filter(stop => focusIndicatorOf(stop) === null)
    .map(stop => `${stop.tagName.toLowerCase()} "${nameOf(stop)}"`)
  expect(bare).toEqual([])
}

/** fireEvent returns false when a handler called preventDefault. */
function keepsKey(element: HTMLElement, init: KeyboardEventInit): boolean {
  return fireEvent.keyDown(element, init)
}

async function renderAnswered(): Promise<void> {
  render(<AssistantChat />)
  fireEvent.change(screen.getByRole('textbox', { name: COMPOSER }), {
    target: { value: 'Who is Matt?' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
  await waitFor(() => screen.getByRole('button', { name: FOLLOW_UP }))
}

describe('/ask before the first question', () => {
  test('Tab meets the list control, each question once, the composer, then the disclosure', () => {
    render(<AssistantChat />)
    expect(tabStops().map(nameOf)).toEqual([
      seeAllQuestionsLabel(STARTER_QUESTIONS.length),
      ...ROW_QUESTIONS,
      COMPOSER,
      // The send button is disabled until there is a question to send.
      'Matt himself',
    ])
  })

  test('every stop draws a focus indicator', () => {
    render(<AssistantChat />)
    expectEveryStopToShowFocus(tabStops())
  })

  test('with every question open, Tab still meets each once and each shows focus', () => {
    render(<AssistantChat />)
    fireEvent.click(
      screen.getByRole('button', {
        name: seeAllQuestionsLabel(STARTER_QUESTIONS.length),
      })
    )
    const stops = tabStops()
    const names = stops.map(nameOf)
    expect(names[0]).toBe(SHOW_FEWER_LABEL)
    // The list's order is its themes' order, which is MTC-85's to pin; here
    // the point is that nothing is skipped or met twice.
    expect([...names.slice(1, 1 + STARTER_QUESTIONS.length)].sort()).toEqual(
      [...STARTER_QUESTIONS].sort()
    )
    expectEveryStopToShowFocus(stops)
  })

  test('no stop keeps Tab, Shift+Tab or Escape from the browser', () => {
    // A handler that cancelled Tab on a pill would trap the keyboard in the
    // ticker; one that cancelled Escape would take it from whatever the
    // browser or a screen reader does with it.
    render(<AssistantChat />)
    const kept = tabStops().filter(
      stop =>
        !keepsKey(stop, { key: 'Tab' }) ||
        !keepsKey(stop, { key: 'Tab', shiftKey: true }) ||
        !keepsKey(stop, { key: 'Escape' })
    )
    expect(kept.map(nameOf)).toEqual([])
  })

  test('Escape in the composer leaves the draft and the caret where they are', () => {
    render(<AssistantChat />)
    const composer = screen.getByRole('textbox', { name: COMPOSER })
    composer.focus()
    fireEvent.change(composer, { target: { value: 'A draft' } })
    fireEvent.keyDown(composer, { key: 'Escape' })
    expect((composer as HTMLTextAreaElement).value).toBe('A draft')
    expect(document.activeElement).toBe(composer)
  })
})

describe('/ask after an answer', () => {
  test('Tab meets the reset, the sources, the answer, its actions, the follow-up, then the composer', async () => {
    await renderAnswered()
    const names = tabStops().map(nameOf)
    expect(names).toEqual([
      RESET_LABEL,
      progressSummary(1, 0, 14),
      'the résumé',
      'Copy',
      'Regenerate',
      FOLLOW_UP,
      COMPOSER,
      'Matt himself',
    ])
  })

  test('every stop draws a focus indicator', async () => {
    await renderAnswered()
    expectEveryStopToShowFocus(tabStops())
  })

  test('no stop keeps Tab, Shift+Tab or Escape from the browser', async () => {
    await renderAnswered()
    const kept = tabStops().filter(
      stop =>
        !keepsKey(stop, { key: 'Tab' }) ||
        !keepsKey(stop, { key: 'Tab', shiftKey: true }) ||
        !keepsKey(stop, { key: 'Escape' })
    )
    expect(kept.map(nameOf)).toEqual([])
  })
})

describe('the homepage panel', () => {
  test('Tab meets the list control, each question once, the composer, then the disclosure', () => {
    render(<RoutedHomeAssistantPanel router={router} />)
    const panel = screen.getByRole('region')
    expect(tabStops(panel).map(nameOf)).toEqual([
      seeAllQuestionsLabel(STARTER_QUESTIONS.length),
      ...ROW_QUESTIONS,
      COMPOSER,
      'Matt himself',
    ])
  })

  test('every stop draws a focus indicator, the send button included', () => {
    render(<RoutedHomeAssistantPanel router={router} />)
    const panel = screen.getByRole('region')
    fireEvent.change(within(panel).getByRole('textbox', { name: COMPOSER }), {
      target: { value: 'Who is Matt?' },
    })
    const stops = tabStops(panel)
    expect(stops.map(nameOf)).toContain('Send question')
    expectEveryStopToShowFocus(stops)
  })
})
