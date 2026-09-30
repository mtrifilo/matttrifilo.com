import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MockLanguageModelV4 } from 'ai/test'
import { FOLLOW_UPS_TRAILER_PREFIX } from '@/lib/chat/answer'
import { createChatHandler } from '@/lib/chat/handler'
import { READ_DOCUMENT_TOOL_NAME } from '@/lib/chat/prompt'
import type { KnowledgeDocument, KnowledgeIndex } from '@/lib/knowledge'
import { AssistantChat } from './assistant-chat'
import { PROGRESS_THINKING, progressReading } from './copy'

/**
 * What the transcript does when the route withdraws streamed text (MTC-101).
 *
 * A step's text streams as the model writes it. When a tool call follows in
 * the same step, the route sends the SDK's `reset-step` chunk and `useChat`
 * drops the step's parts, so the narration leaves the bubble and the
 * progress row is what the visitor sees instead. The route here is the real
 * handler over a scripted model whose calls the test releases one at a time,
 * so each state the visitor passes through can be looked at: the narration
 * on screen, then gone with the read's row in its place, then the answer.
 */

const documents: KnowledgeDocument[] = ['resume', 'faq'].map(id => ({
  id,
  title: id,
  summary: `The ${id}.`,
  tags: [],
  topic: 'resume',
  source: 'resume',
  tokenEstimate: 8,
  text: `Matt's ${id}.`,
  updated: '2026-09-01',
}))

const index: KnowledgeIndex = {
  entries: documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    summary: doc.summary,
    tags: doc.tags,
    topic: doc.topic,
    source: doc.source,
    tokenEstimate: doc.tokenEstimate,
  })),
  text: documents.map(doc => `[${doc.id}] ${doc.summary}`).join('\n'),
  tokenEstimate: 40,
  builtAt: '2026-09-29T00:00:00.000Z',
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
}

const NARRATION = 'Let me check his resume before answering.'
const PROSE = 'Matt led the platform migration.'
const FOLLOW_UP = 'What did the migration change?'
const FINISHED = [
  `${PROSE}\n\nSources: resume`,
  FOLLOW_UPS_TRAILER_PREFIX,
  FOLLOW_UP,
].join('\n')

/** A promise the test resolves by hand. */
function gate() {
  let open!: () => void
  const opened = new Promise<void>(resolve => {
    open = resolve
  })
  return { open, opened }
}

/**
 * One model call: `before` streams at once, the rest only once `wait`
 * resolves.
 */
function call(before: unknown[], wait: Promise<void>, after: unknown[]) {
  return {
    stream: new ReadableStream({
      async start(controller) {
        for (const part of before) controller.enqueue(part)
        await wait
        for (const part of after) controller.enqueue(part)
        controller.close()
      },
    }),
  }
}

const finish = (unified: 'stop' | 'tool-calls') => ({
  type: 'finish',
  finishReason: { unified, raw: unified },
  usage,
})

/**
 * Narrates, waits for `first`, then reads the résumé; waits for `second`,
 * then answers. Any later call answers at once.
 */
function narratingModel(first: Promise<void>, second: Promise<void>) {
  let calls = 0
  return new MockLanguageModelV4({
    doStream: async () => {
      calls += 1
      if (calls === 1) {
        return call(
          [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'n' },
            { type: 'text-delta', id: 'n', delta: NARRATION },
          ],
          first,
          [
            { type: 'text-end', id: 'n' },
            {
              type: 'tool-call',
              toolCallId: 'call-resume',
              toolName: READ_DOCUMENT_TOOL_NAME,
              input: JSON.stringify({ id: 'resume' }),
            },
            finish('tool-calls'),
          ]
        ) as never
      }
      return call(
        [{ type: 'stream-start', warnings: [] }],
        calls === 2 ? second : Promise.resolve(),
        [
          { type: 'text-start', id: 'a' },
          { type: 'text-delta', id: 'a', delta: FINISHED },
          { type: 'text-end', id: 'a' },
          finish('stop'),
        ]
      ) as never
    },
  })
}

const realFetch = globalThis.fetch
/** The body of every request the page sent to the route. */
let requests: string[]

function routeWith(model: MockLanguageModelV4): typeof fetch {
  const handle = createChatHandler({
    loadKnowledgeIndex: () => index,
    readKnowledgeDocument: id => documents.find(doc => doc.id === id),
    model: () => model,
    verifyVisitor: async () => ({
      isBot: false,
      isVerifiedBot: false,
      bypassed: false,
    }),
    env: {},
    now: () => 0,
  })
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(String(init?.body ?? ''))
    return handle(
      new Request(new URL(String(input), 'https://matttrifilo.com'), init)
    )
  }) as typeof fetch
}

const realInfo = console.info
const realWarn = console.warn
const clipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard'
)
/** What the Copy button wrote. */
let copied: string[]

beforeEach(() => {
  sessionStorage.clear()
  requests = []
  copied = []
  console.info = () => {}
  console.warn = () => {}
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        copied.push(text)
      },
    },
  })
})

afterEach(() => {
  globalThis.fetch = realFetch
  console.info = realInfo
  console.warn = realWarn
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
  sessionStorage.clear()
})

async function ask(model: MockLanguageModelV4): Promise<HTMLElement> {
  globalThis.fetch = routeWith(model)
  const { container } = render(<AssistantChat />)
  const composer = screen.getByRole('textbox', {
    name: "Ask a question about Matt's work",
  })
  fireEvent.change(composer, { target: { value: 'What did Matt build?' } })
  fireEvent.keyDown(composer, { key: 'Enter' })
  await waitFor(() =>
    expect(container.querySelector('.is-assistant')).not.toBeNull()
  )
  return container.querySelector('.is-assistant') as HTMLElement
}

describe('an answer that streams', () => {
  test('keeps both trailers off the screen as they arrive, token by token', async () => {
    const gates = [gate(), gate()]
    const deltas = [
      `${PROSE}\n\nSour`,
      'ces: resume\nFollow',
      `-ups:\n${FOLLOW_UP}`,
    ]
    const model = new MockLanguageModelV4({
      doStream: async () =>
        ({
          stream: new ReadableStream({
            async start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] })
              controller.enqueue({ type: 'text-start', id: 'a' })
              for (const [at, delta] of deltas.entries()) {
                if (at > 0) await gates[at - 1].opened
                controller.enqueue({ type: 'text-delta', id: 'a', delta })
              }
              controller.enqueue({ type: 'text-end', id: 'a' })
              controller.enqueue(finish('stop'))
              controller.close()
            },
          }),
        }) as never,
    })
    const turn = await ask(model)

    // A half-written prefix is prose until the word is whole: the cost of
    // not guessing at lines that open "So" (lib/chat/answer.ts).
    await waitFor(() => expect(turn.textContent).toContain('Sour'))
    expect(turn.textContent).toContain(PROSE)

    // The citation line is whole, and a follow-ups marker is half written
    // under it: neither the ids nor the marker shows.
    gates[0].open()
    await waitFor(() => expect(turn.textContent).not.toContain('Sour'))
    expect(turn.textContent).toContain(PROSE)
    expect(turn.textContent).not.toContain('resume')
    expect(turn.textContent).not.toContain('Follow')

    gates[1].open()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: FOLLOW_UP })).not.toBeNull()
    )
    // The question shows once, as a pill, and not in the answer above it.
    expect(turn.textContent?.split(FOLLOW_UP)).toHaveLength(2)
    expect(turn.textContent).not.toContain('Sources')
  })
})

describe('narration a call withdraws', () => {
  test('shows while it streams, then gives way to the progress row, and never reaches the copy buffer, the follow-ups or the next request', async () => {
    const first = gate()
    const second = gate()
    const turn = await ask(narratingModel(first.opened, second.opened))

    // The flash: until the call arrives, the narration reads as the start
    // of an answer, under the thinking header.
    await waitFor(() => expect(turn.textContent).toContain(NARRATION))
    expect(turn.textContent).toContain(PROGRESS_THINKING)

    first.open()
    await waitFor(() =>
      expect(turn.textContent).toContain(progressReading('resume'))
    )
    expect(turn.textContent).not.toContain(NARRATION)

    second.open()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeNull()
    )
    expect(turn.textContent).toContain(PROSE)
    expect(turn.textContent).not.toContain(NARRATION)

    // Copy writes the answer the bubble shows, trailers off, and nothing
    // the route withdrew.
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(copied).toHaveLength(1))
    expect(copied[0]).toBe(PROSE)

    // The follow-ups are the validated metadata, never withdrawn text.
    const pills = screen
      .getAllByRole('button')
      .map(button => button.textContent ?? '')
      .filter(label => label.endsWith('?'))
    expect(pills).toEqual([FOLLOW_UP])

    // The next question replays the transcript as the browser holds it,
    // which no longer has the narration.
    fireEvent.click(screen.getByRole('button', { name: FOLLOW_UP }))
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]).toContain(PROSE)
    expect(requests[1]).not.toContain(NARRATION)
  })

  test('a visitor who stops before the call keeps the text, as a partial answer (known limit)', async () => {
    // At the moment of the stop nothing has said the text was narration, and
    // the same stop during a real answer must keep what was written. So the
    // narration stays, and Copy offers it. Whether that is acceptable is
    // Matt's call on the preview (MTC-101).
    const first = gate()
    const turn = await ask(narratingModel(first.opened, Promise.resolve()))
    await waitFor(() => expect(turn.textContent).toContain(NARRATION))

    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
    first.open()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeNull()
    )
    expect(turn.textContent).toContain(NARRATION)
  })
})
