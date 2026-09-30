import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { FOLLOW_UPS_TRAILER_PREFIX } from '@/lib/chat/answer'
import { createChatHandler } from '@/lib/chat/handler'
import { DECLINE_SENTENCE, READ_DOCUMENT_TOOL_NAME } from '@/lib/chat/prompt'
import type { KnowledgeDocument, KnowledgeIndex } from '@/lib/knowledge'
import { AssistantChat } from './assistant-chat'
import { INCOMPLETE_NOTICE } from './copy'

/**
 * What the transcript shows for each way the last step can end (MTC-100).
 *
 * The route is the real handler over a scripted model, so what is rendered
 * is exactly what the route streams, not a hand-written copy of it that
 * could drift. The case under test is a model that ignores the last step's
 * `toolChoice: 'none'` and calls a tool: the visitor gets the answer if one
 * was written, and the existing "couldn't finish" notice if not, never an
 * assistant turn with nothing in it.
 */

const documents: KnowledgeDocument[] = [
  'resume',
  'faq',
  'projects',
  'timeline',
].map(id => ({
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

const NARRATION = 'Let me open the timeline as well.'
const PROSE = 'Matt led the platform migration.'
const FOLLOW_UP = 'What did the migration change?'
const FINISHED = [
  `${PROSE}\n\nSources: resume`,
  FOLLOW_UPS_TRAILER_PREFIX,
  FOLLOW_UP,
].join('\n')

type Part = { text: string } | { read: string }

/** One model call, streaming the parts in order. */
function step(parts: Part[], finish: 'stop' | 'tool-calls') {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        ...parts.flatMap<unknown>((part, n) =>
          'text' in part
            ? [
                { type: 'text-start', id: `t${n}` },
                { type: 'text-delta', id: `t${n}`, delta: part.text },
                { type: 'text-end', id: `t${n}` },
              ]
            : [
                {
                  type: 'tool-call',
                  toolCallId: `call-${part.read}-${n}`,
                  toolName: READ_DOCUMENT_TOOL_NAME,
                  input: JSON.stringify({ id: part.read }),
                },
              ]
        ),
        {
          type: 'finish',
          finishReason: { unified: finish, raw: finish },
          usage,
        },
      ] as never[],
      chunkDelayInMs: null,
      initialDelayInMs: null,
    }),
  }
}

/**
 * Three reads spend every step but the last; `last` is what the model does
 * on the step the route sends `toolChoice: 'none'`.
 */
function modelEndingWith(last: Part[]) {
  const calls = [
    [{ read: 'resume' }],
    [{ read: 'faq' }],
    [{ read: 'projects' }],
    last,
  ]
  let call = 0
  return new MockLanguageModelV4({
    doStream: async () => {
      const parts = calls[Math.min(call, calls.length - 1)]
      call += 1
      const callsTool = parts.some(part => 'read' in part)
      return step(parts, callsTool ? 'tool-calls' : 'stop') as never
    },
  })
}

const realFetch = globalThis.fetch

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
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    handle(
      new Request(new URL(String(input), 'https://matttrifilo.com'), init)
    )) as typeof fetch
}

/** Everything written to the console by the route, kept out of the output. */
const realInfo = console.info
const realWarn = console.warn

beforeEach(() => {
  sessionStorage.clear()
  console.info = () => {}
  console.warn = () => {}
})

afterEach(() => {
  globalThis.fetch = realFetch
  console.info = realInfo
  console.warn = realWarn
  sessionStorage.clear()
})

/**
 * Asks one question and returns the assistant's turn once it exists. Each
 * test then waits for the thing that only arrives when the run ends: the
 * notice rides on the finish chunk, and Copy is offered only once the page
 * is ready again.
 */
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

/** Resolves once a run that answered has ended. */
async function answeredRunEnded(): Promise<void> {
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeNull()
  )
}

describe('the last step called a tool', () => {
  test('with only narration, the turn holds the notice and no text', async () => {
    const turn = await ask(
      modelEndingWith([{ text: NARRATION }, { read: 'timeline' }])
    )

    await waitFor(() => expect(turn.textContent).toContain(INCOMPLETE_NOTICE))
    expect(turn.textContent).not.toContain(NARRATION)
    // Copy and Regenerate go with an answer; with none there is nothing to
    // copy, so the notice is the whole turn below the steps.
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull()
  })

  test('with no text at all, the turn holds the notice', async () => {
    const turn = await ask(modelEndingWith([{ read: 'timeline' }]))

    await waitFor(() => expect(turn.textContent).toContain(INCOMPLETE_NOTICE))
  })

  test('with a finished answer, the answer is shown and the notice is not', async () => {
    const turn = await ask(
      modelEndingWith([{ text: FINISHED }, { read: 'timeline' }])
    )

    await answeredRunEnded()
    expect(turn.textContent).toContain(PROSE)
    expect(turn.textContent).not.toContain(INCOMPLETE_NOTICE)
    expect(screen.queryByRole('button', { name: FOLLOW_UP })).not.toBeNull()
  })

  test('with narration, then the call, then an answer, only the answer is shown', async () => {
    const turn = await ask(
      modelEndingWith([
        { text: NARRATION },
        { read: 'timeline' },
        { text: FINISHED },
      ])
    )

    await answeredRunEnded()
    expect(turn.textContent).toContain(PROSE)
    expect(turn.textContent).not.toContain(NARRATION)
    expect(turn.textContent).not.toContain(INCOMPLETE_NOTICE)
  })

  test('with only the trailers, the turn holds the notice', async () => {
    const turn = await ask(
      modelEndingWith([
        { text: `Sources: resume\n${FOLLOW_UPS_TRAILER_PREFIX}\n${FOLLOW_UP}` },
        { read: 'timeline' },
      ])
    )

    await waitFor(() => expect(turn.textContent).toContain(INCOMPLETE_NOTICE))
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  test('with a decline, the decline is shown and the notice is not', async () => {
    const turn = await ask(
      modelEndingWith([{ text: DECLINE_SENTENCE }, { read: 'timeline' }])
    )

    await answeredRunEnded()
    expect(turn.textContent).toContain(DECLINE_SENTENCE.slice(0, 40))
    expect(turn.textContent).not.toContain(INCOMPLETE_NOTICE)
  })
})

describe('the last step obeyed', () => {
  test('a decline is shown with no notice', async () => {
    const turn = await ask(modelEndingWith([{ text: DECLINE_SENTENCE }]))

    await answeredRunEnded()
    expect(turn.textContent).toContain(DECLINE_SENTENCE.slice(0, 40))
    expect(turn.textContent).not.toContain(INCOMPLETE_NOTICE)
  })
})
