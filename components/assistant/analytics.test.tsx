import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DECLINE_SENTENCE } from '@/lib/chat/answer'
import { repositoryDeclineSentence } from '@/lib/chat/prompt'
import { assistantRepository } from '@/lib/chat/repositories'
import { answered, openStream, type OpenStream } from '@/test/chat-stream'
import { forgetOpenedSurfaces } from './analytics'
import { AssistantChat } from './assistant-chat'
import {
  seeAllQuestionsLabel,
  SHOW_FEWER_LABEL,
  STARTER_QUESTIONS,
} from './copy'
import {
  RoutedHomeAssistantPanel,
  type PanelRouter,
} from './home-assistant-panel'
import { handOffQuestion } from './pending-question'

/**
 * The assistant's analytics events (MTC-35), as the analytics script would
 * receive them.
 *
 * `<Analytics />` defines `window.va` and the package's `track` hands each
 * event to it; where the component is not rendered (locally, in CI) there is
 * no `window.va` and `track` does nothing. So these tests stand in for the
 * script at `window.va`, which runs the real `track` and records exactly
 * what would leave the page: every payload is compared as the JSON the
 * script would be handed, so a property added anywhere, or a visitor's words
 * in any field, fails here.
 */

const TYPED = 'What did Matt ship in 2025?'
const ANSWER = 'Matt led the platform team.'
const FOLLOW_UP = 'What did the platform team ship next?'

/** The decline about a listed repository (MTC-115): the sentence, then its link. */
const DECANT = assistantRepository('decant')
if (!DECANT) throw new Error('decant is no longer on the assistant allowlist')
const DECLINE_WITH_LINK = `${DECLINE_SENTENCE} ${repositoryDeclineSentence(DECANT)}`

/** What the script was handed, one JSON string per call, in order. */
let sent: string[] = []

const realFetch = globalThis.fetch
const realConsoleError = console.error
let consoleErrors: unknown[][] = []

/** The route's reply to the next question. */
let reply:
  'answer' | 'decline' | 'decline with link' | 'rate limit' | 'held open' =
  'answer'

/** The stream of the last request answered 'held open', sent by the test. */
let held: OpenStream | undefined

function routeFetch(): Promise<Response> {
  if (reply === 'held open') {
    held = openStream()
    return Promise.resolve(held.response)
  }
  if (reply === 'rate limit') {
    // The WAF's own body; the transport turns any 429 into the notice.
    return Promise.resolve(new Response('Too Many Requests', { status: 429 }))
  }
  const declines = reply === 'decline' || reply === 'decline with link'
  const text =
    reply === 'decline'
      ? DECLINE_SENTENCE
      : reply === 'decline with link'
        ? DECLINE_WITH_LINK
        : ANSWER
  return Promise.resolve(
    answered([
      {
        type: 'start',
        messageMetadata: declines ? {} : { followUps: [FOLLOW_UP] },
      },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: text },
      { type: 'text-end', id: 't' },
      { type: 'finish' },
    ])
  )
}

beforeEach(() => {
  sent = []
  consoleErrors = []
  reply = 'answer'
  held = undefined
  forgetOpenedSurfaces()
  sessionStorage.clear()
  globalThis.fetch = routeFetch as unknown as typeof fetch
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args)
  }
  window.va = (event, properties) => {
    sent.push(JSON.stringify([event, properties]))
  }
})

afterEach(() => {
  delete window.va
  globalThis.fetch = realFetch
  console.error = realConsoleError
  sessionStorage.clear()
})

/** The exact JSON the script receives for one custom event. */
function event(name: string, data: Record<string, string>): string {
  return JSON.stringify(['event', { name, data }])
}

const opened = (surface: string) => event('Assistant opened', { surface })
const asked = (surface: string, source: string) =>
  event('Question asked', { surface, source })
const declined = (surface: string) => event('Answer declined', { surface })
const rateLimited = (surface: string) => event('Rate limit hit', { surface })

function composer(): HTMLElement {
  return screen.getByRole('textbox', {
    name: "Ask a question about Matt's work",
  })
}

function type(text: string): void {
  fireEvent.change(composer(), { target: { value: text } })
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
}

/** The announced copy of a starter pill; the decorative copies are hidden. */
function pill(question: string = STARTER_QUESTIONS[0]): HTMLElement {
  return screen.getByRole('button', { name: question })
}

function openList(): void {
  fireEvent.click(
    screen.getByRole('button', {
      name: seeAllQuestionsLabel(STARTER_QUESTIONS.length),
    })
  )
}

/** Resolves once the page has said something about the last request. */
async function settled(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).not.toBe('')
  )
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull()
  )
}

/** No payload carries anything a visitor wrote or was shown. */
function expectNoVisitorText(...texts: string[]): void {
  for (const payload of sent) {
    for (const text of texts) expect(payload).not.toContain(text)
  }
}

describe('on the homepage', () => {
  let pushed: string[] = []
  const router: PanelRouter = {
    push: href => {
      pushed.push(href)
    },
    prefetch: () => {},
  }

  beforeEach(() => {
    pushed = []
  })

  function renderPanel(): void {
    render(<RoutedHomeAssistantPanel router={router} />)
  }

  test('a page load with nothing touched sends nothing', () => {
    renderPanel()
    fireEvent.focus(composer())
    expect(sent).toEqual([])
  })

  test('typing in the composer opens the assistant, once', () => {
    renderPanel()
    type('W')
    type('Wh')
    expect(sent).toEqual([opened('home')])
  })

  test('a click or tap on the composer opens the assistant', () => {
    renderPanel()
    fireEvent.pointerDown(composer(), { pointerType: 'touch' })
    fireEvent.click(composer())
    expect(sent).toEqual([opened('home')])
  })

  test('a touch that starts a page scroll on the composer is not an open', () => {
    // The browser fires pointerdown, then pointercancel once it takes the
    // gesture as a pan, and no click.
    renderPanel()
    fireEvent.pointerDown(composer(), { pointerType: 'touch' })
    fireEvent.pointerCancel(composer(), { pointerType: 'touch' })
    expect(sent).toEqual([])
  })

  test('a typed question is asked from the homepage, typed', () => {
    renderPanel()
    type(TYPED)
    submit()
    expect(pushed).toEqual(['/ask'])
    expect(sent).toEqual([opened('home'), asked('home', 'typed')])
    expectNoVisitorText(TYPED)
  })

  test('a starter pill is asked from the homepage, as a pill', () => {
    renderPanel()
    fireEvent.click(pill())
    expect(pushed).toEqual(['/ask'])
    expect(sent).toEqual([opened('home'), asked('home', 'pill')])
    expectNoVisitorText(STARTER_QUESTIONS[0])
  })

  test('opening the list opens the assistant, and a question from it is asked as the list', () => {
    renderPanel()
    openList()
    expect(sent).toEqual([opened('home')])
    fireEvent.click(pill(STARTER_QUESTIONS[1]))
    expect(sent).toEqual([opened('home'), asked('home', 'list')])
    expectNoVisitorText(STARTER_QUESTIONS[1])
  })

  test('closing the list is not another open', () => {
    renderPanel()
    openList()
    fireEvent.click(screen.getByRole('button', { name: SHOW_FEWER_LABEL }))
    openList()
    expect(sent).toEqual([opened('home')])
  })

  test('without the analytics script the pick still goes to /ask, silently', () => {
    delete window.va
    renderPanel()
    type(TYPED)
    submit()
    fireEvent.click(pill())
    expect(pushed).toEqual(['/ask', '/ask'])
    expect(consoleErrors).toEqual([])
  })

  test('a script that throws costs the visitor nothing', () => {
    window.va = () => {
      throw new Error('analytics is down')
    }
    renderPanel()
    fireEvent.click(pill())
    expect(pushed).toEqual(['/ask'])
  })
})

describe('on /ask', () => {
  test('loading the page, composer focused by the page itself, sends nothing', () => {
    render(<AssistantChat />)
    expect(document.activeElement).toBe(composer())
    expect(sent).toEqual([])
  })

  test('a typed question is asked on /ask, typed, and an answer is not a decline', async () => {
    render(<AssistantChat />)
    type(TYPED)
    submit()
    await settled()
    expect(sent).toEqual([opened('ask'), asked('ask', 'typed')])
    expectNoVisitorText(TYPED, ANSWER)
  })

  test('a starter pill is asked on /ask, as a pill', async () => {
    render(<AssistantChat />)
    fireEvent.click(pill())
    await settled()
    expect(sent).toEqual([opened('ask'), asked('ask', 'pill')])
  })

  test('a question from the list is asked on /ask, as the list', async () => {
    render(<AssistantChat />)
    openList()
    fireEvent.click(pill(STARTER_QUESTIONS[2]))
    await settled()
    expect(sent).toEqual([opened('ask'), asked('ask', 'list')])
  })

  test('a follow-up is asked on /ask, as a follow-up', async () => {
    render(<AssistantChat />)
    fireEvent.click(pill())
    await settled()
    fireEvent.click(await screen.findByRole('button', { name: FOLLOW_UP }))
    await settled()
    expect(sent).toEqual([
      opened('ask'),
      asked('ask', 'pill'),
      asked('ask', 'follow-up'),
    ])
    expectNoVisitorText(FOLLOW_UP)
  })

  test('a decline is counted once, against /ask', async () => {
    reply = 'decline'
    render(<AssistantChat />)
    type(TYPED)
    submit()
    await settled()
    expect(sent).toEqual([
      opened('ask'),
      asked('ask', 'typed'),
      declined('ask'),
    ])
    expectNoVisitorText(TYPED, DECLINE_SENTENCE.slice(0, 20))
  })

  test("a decline that carries a repository's link is counted once, as a decline", async () => {
    reply = 'decline with link'
    render(<AssistantChat />)
    type(TYPED)
    submit()
    await settled()
    expect(sent).toEqual([
      opened('ask'),
      asked('ask', 'typed'),
      declined('ask'),
    ])
    expectNoVisitorText(TYPED, 'github.com')
  })

  test('the rate limit is counted once, against /ask, when its notice shows', async () => {
    reply = 'rate limit'
    render(<AssistantChat />)
    type(TYPED)
    submit()
    await screen.findByRole('alert')
    expect(sent).toEqual([
      opened('ask'),
      asked('ask', 'typed'),
      rateLimited('ask'),
    ])
  })

  test('coming back to /ask in the same page load is not another open', async () => {
    const { unmount } = render(<AssistantChat />)
    type('W')
    unmount()
    render(<AssistantChat />)
    type('Wh')
    expect(sent).toEqual([opened('ask')])
  })

  test('a regenerate is not a question asked; its decline counts again, against the surface of its question', async () => {
    reply = 'decline'
    render(<AssistantChat />)
    type(TYPED)
    submit()
    await settled()
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    await settled()
    expect(sent).toEqual([
      opened('ask'),
      asked('ask', 'typed'),
      declined('ask'),
      declined('ask'),
    ])
  })

  test('a regenerate refused at the rate limit is counted', async () => {
    render(<AssistantChat />)
    type(TYPED)
    submit()
    await settled()
    reply = 'rate limit'
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    await screen.findByRole('alert')
    expect(sent).toEqual([
      opened('ask'),
      asked('ask', 'typed'),
      rateLimited('ask'),
    ])
  })

  describe('a decline that does not finish cleanly', () => {
    async function declineArriving(text: string): Promise<OpenStream> {
      reply = 'held open'
      render(<AssistantChat />)
      type(TYPED)
      submit()
      await waitFor(() => expect(held).toBeDefined())
      const stream = held as OpenStream
      stream.push({ type: 'start' })
      stream.push({ type: 'text-start', id: 't' })
      stream.push({ type: 'text-delta', id: 't', delta: text })
      await screen.findByText(text.slice(0, 30), { exact: false })
      return stream
    }

    function stop(): void {
      fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
    }

    test('stopped part way through the sentence is not a decline', async () => {
      await declineArriving(DECLINE_SENTENCE.slice(0, 50))
      stop()
      await settled()
      expect(sent).toEqual([opened('ask'), asked('ask', 'typed')])
    })

    test('stopped after the whole sentence is one decline', async () => {
      await declineArriving(DECLINE_SENTENCE)
      stop()
      await settled()
      expect(sent).toEqual([
        opened('ask'),
        asked('ask', 'typed'),
        declined('ask'),
      ])
    })

    test('failed after the whole sentence is one decline', async () => {
      const stream = await declineArriving(DECLINE_SENTENCE)
      stream.push({
        type: 'error',
        errorText: JSON.stringify({
          error: { code: 'interrupted', message: 'The answer was cut off.' },
        }),
      })
      stream.close()
      await screen.findByRole('alert')
      expect(sent).toEqual([
        opened('ask'),
        asked('ask', 'typed'),
        declined('ask'),
      ])
      expectNoVisitorText('cut off')
    })
  })

  describe('a question handed over from the homepage', () => {
    test('is not asked again, and its decline is the homepage’s', async () => {
      reply = 'decline'
      handOffQuestion({ question: TYPED, askedBy: 'typing' })
      render(<AssistantChat />)
      await settled()
      expect(sent).toEqual([declined('home')])
      expectNoVisitorText(TYPED)
    })

    test('a regenerate of its declined answer is the homepage’s too', async () => {
      reply = 'decline'
      handOffQuestion({ question: TYPED, askedBy: 'typing' })
      render(<AssistantChat />)
      await settled()
      fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
      await settled()
      expect(sent).toEqual([declined('home'), declined('home')])
    })

    test('hitting the rate limit is the homepage’s', async () => {
      reply = 'rate limit'
      handOffQuestion({ question: TYPED, askedBy: 'other-pick' })
      render(<AssistantChat />)
      await screen.findByRole('alert')
      expect(sent).toEqual([rateLimited('home')])
    })

    test('the next question, asked on /ask, is /ask’s, and so is its decline', async () => {
      handOffQuestion({ question: TYPED, askedBy: 'typing' })
      render(<AssistantChat />)
      await settled()
      reply = 'decline'
      fireEvent.click(await screen.findByRole('button', { name: FOLLOW_UP }))
      await settled()
      expect(sent).toEqual([
        opened('ask'),
        asked('ask', 'follow-up'),
        declined('ask'),
      ])
    })
  })

  test('without the analytics script, asking, a decline and the rate limit are silent', async () => {
    delete window.va
    reply = 'decline'
    render(<AssistantChat />)
    type(TYPED)
    submit()
    await settled()
    reply = 'rate limit'
    type('And another?')
    submit()
    await screen.findByRole('alert')
    expect(consoleErrors).toEqual([])
  })
})
