import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { FOCUS_RING } from '@/lib/focus-ring'
import { answered } from '@/test/chat-stream'
import { setTouchDevice } from '@/test/touch-device'
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
  return Promise.resolve(answered(chunks))
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
  const classes = element.className.split(/\s+/)
  if (FOCUS_RING.split(' ').every(name => classes.includes(name)))
    return 'outline'
  // components/ui/button.tsx: a 3 px ring in the ring token. At full
  // strength only: `ring-ring/50` was 2.1:1 on the dark theme, where
  // `dark:border-border` also outranks the focused border, so the halo is
  // the whole indicator there.
  if (
    classes.includes('focus-visible:ring-ring') &&
    classes.includes('focus-visible:ring-[3px]')
  )
    return 'button ring'
  // The composer's field: its form draws the ring token on focus within.
  if (element.tagName === 'TEXTAREA') {
    const form = element.closest('form')
    if (form?.className.split(/\s+/).includes('focus-within:border-ring'))
      return 'form'
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

describe('Regenerate, which goes as the new run starts', () => {
  // The actions are offered on a finished answer only, so the button that
  // had focus is gone a render later. Where focus goes follows the pick
  // rule in pointer.ts (MTC-74, MTC-81).
  afterEach(() => {
    setTouchDevice(false)
  })

  test('hands focus to the composer when pressed with a key', async () => {
    await renderAnswered()
    const regenerate = screen.getByRole('button', { name: 'Regenerate' })
    regenerate.focus()
    fireEvent.keyDown(regenerate, { key: 'Enter' })
    fireEvent.click(regenerate)
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: COMPOSER })
    )
    // The regenerated answer arrives; the caret stays where it was put.
    await waitFor(() => screen.getByRole('button', { name: 'Regenerate' }))
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: COMPOSER })
    )
  })

  test('hands focus to the status region, not the composer, after a touch', async () => {
    setTouchDevice(true)
    await renderAnswered()
    const regenerate = screen.getByRole('button', { name: 'Regenerate' })
    fireEvent.pointerDown(regenerate, { pointerType: 'touch' })
    fireEvent.click(regenerate)
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('status'))
    )
    await waitFor(() => screen.getByRole('button', { name: 'Regenerate' }))
  })
})

describe('"Jump to latest", which goes once the transcript reaches its end', () => {
  test('hands focus on through the page, which applies the pick rule', () => {
    // It shows only while the transcript is scrolled away from its end,
    // which Happy DOM cannot lay out, so the wiring is read from source.
    const read = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(read('../ai-elements/conversation.tsx')).toContain(
      'afterScroll?.();'
    )
    const chat = read('./assistant-chat.tsx')
    expect(chat).toContain(
      '<ConversationScrollButton afterScroll={focusAfterJump} />'
    )
    expect(chat).toMatch(
      /focusAfterJump = useCallback\(\(\) => \{\s*if \(!activatedByTouch\(\)\) textareaRef\.current\?\.focus\(\)/
    )
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
