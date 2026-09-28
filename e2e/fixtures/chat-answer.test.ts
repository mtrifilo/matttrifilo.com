import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import path from 'path'
import { DefaultChatTransport, readUIMessageStream } from 'ai'
import { toAnswerView, type AnswerView } from '@/lib/chat/answer'
import type { ChatUIMessage } from '@/lib/chat/handler'
import { createChatFetch } from '@/lib/chat/transport'
import {
  RECORDED_ANSWER_HEADERS,
  RECORDED_ANSWER_PARAGRAPHS,
  RECORDED_ANSWER_FILE,
  RECORDED_FOLLOW_UPS,
  RECORDED_RUN_MS,
  RECORDED_SOURCE,
} from './chat-answer'
import { recordChatAnswer } from './record-chat-answer'

/**
 * The browser checks answer /api/chat with a recorded body (MTC-86). These
 * tests are what stop that recording from drifting away from the route and
 * the client while the browser checks keep passing against it.
 */

const committed = () =>
  readFileSync(path.join(__dirname, RECORDED_ANSWER_FILE), 'utf8')

describe('the recorded chat answer', () => {
  test('is what the route handler writes today', async () => {
    const { body, headers } = await recordChatAnswer()
    // On a failure: if the handler's change was deliberate, run
    // `bun e2e/fixtures/record-chat-answer.ts` and read the diff.
    expect(committed()).toBe(body)
    expect(headers).toEqual({ ...RECORDED_ANSWER_HEADERS })
  })

  test("reads, through the client's own transport, as the answer the browser checks expect", async () => {
    const view = await readThroughClient(committed())

    expect(view.text).toBe(RECORDED_ANSWER_PARAGRAPHS.join('\n\n'))
    expect(view.followUps).toEqual([...RECORDED_FOLLOW_UPS])
    expect(view.incomplete).toBe(false)
    expect(view.truncated).toBe(false)
    expect(view.progress).toEqual({
      phase: 'done',
      ms: RECORDED_RUN_MS,
      steps: [
        {
          id: RECORDED_SOURCE.id,
          title: RECORDED_SOURCE.title,
          topic: RECORDED_SOURCE.source,
          headings: [...RECORDED_SOURCE.headings],
        },
      ],
    })
  })
})

/**
 * The recorded body as the page would read it: the same transport and fetch
 * wrapper the chat uses (components/assistant/assistant-chat.tsx), then the
 * SDK's own reader, then the view the transcript renders.
 */
async function readThroughClient(body: string): Promise<AnswerView> {
  const transport = new DefaultChatTransport<ChatUIMessage>({
    api: 'https://matttrifilo.com/api/chat',
    fetch: createChatFetch(
      async () =>
        new Response(body, { status: 200, headers: RECORDED_ANSWER_HEADERS })
    ),
  })
  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'recorded-chat',
    messageId: undefined,
    messages: [
      {
        id: 'recorded-question',
        role: 'user',
        parts: [{ type: 'text', text: 'What does the fixture say?' }],
      },
    ],
    abortSignal: undefined,
  })
  let last: ChatUIMessage | undefined
  for await (const message of readUIMessageStream<ChatUIMessage>({
    stream,
    terminateOnError: true,
  })) {
    last = message
  }
  if (!last) throw new Error('the recorded body produced no message')
  return toAnswerView(last)
}
