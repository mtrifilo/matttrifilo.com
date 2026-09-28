import { writeFileSync } from 'fs'
import path from 'path'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { createChatHandler } from '@/lib/chat/handler'
import { READ_DOCUMENT_TOOL_NAME } from '@/lib/chat/prompt'
import type {
  KnowledgeDocument,
  KnowledgeEntry,
  KnowledgeIndex,
} from '@/lib/knowledge'
import {
  RECORDED_ANSWER_PARAGRAPHS,
  RECORDED_ANSWER_FILE,
  RECORDED_RUN_MS,
  RECORDED_SOURCE,
  recordedModelText,
} from './chat-answer'

/**
 * Records the response body the browser checks answer /api/chat with
 * (MTC-86), by running the route's own handler against a scripted model.
 *
 * Everything but the model is the route's: the visitor check passes, the
 * request is validated, the read tool runs against a one-document index, and
 * the stream goes through the same filters and the same progress narration
 * as a production answer. So the bytes are exactly what the browser would
 * be sent for a run that read one document and wrote this answer, and when
 * the handler changes what it writes, ./chat-answer.test.ts says so.
 *
 * Run `bun e2e/fixtures/record-chat-answer.ts` to write the file again after
 * a deliberate change to the wire format, then read the diff.
 */

const ENTRY: KnowledgeEntry = {
  id: RECORDED_SOURCE.id,
  title: RECORDED_SOURCE.title,
  summary: 'A document the browser checks pretend to read.',
  tags: [],
  topic: 'roles',
  source: RECORDED_SOURCE.source,
  tokenEstimate: 20,
  headings: RECORDED_SOURCE.headings,
}

const DOCUMENT: KnowledgeDocument = {
  ...ENTRY,
  text: RECORDED_SOURCE.headings
    .map(heading => `## ${heading}\n\nFixture.`)
    .join('\n\n'),
  updated: '2026-09-28',
}

const INDEX: KnowledgeIndex = {
  entries: [ENTRY],
  text: `[${DOCUMENT.id}]\ntitle: ${DOCUMENT.title}\nsummary: ${DOCUMENT.summary}`,
  tokenEstimate: 40,
  builtAt: '2026-09-28T00:00:00.000Z',
}

const USAGE = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 50, text: 50, reasoning: 0 },
}

/** The first model call reads the document; the second writes the answer. */
function scriptedModel(): MockLanguageModelV4 {
  const [lead] = RECORDED_ANSWER_PARAGRAPHS
  const text = recordedModelText()
  const steps: unknown[][] = [
    [
      { type: 'stream-start', warnings: [] },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: READ_DOCUMENT_TOOL_NAME,
        input: JSON.stringify({ id: DOCUMENT.id }),
      },
      {
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'TOOL_CALLS' },
        usage: USAGE,
      },
    ],
    [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'answer' },
      // Two pieces, so the transcript is built from more than one delta.
      { type: 'text-delta', id: 'answer', delta: lead },
      { type: 'text-delta', id: 'answer', delta: text.slice(lead.length) },
      { type: 'text-end', id: 'answer' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'STOP' },
        usage: USAGE,
      },
    ],
  ]
  let call = 0
  return new MockLanguageModelV4({
    doStream: async () => {
      const chunks = steps[Math.min(call, steps.length - 1)]
      call += 1
      return {
        stream: simulateReadableStream({
          chunks: chunks as never[],
          chunkDelayInMs: null,
          initialDelayInMs: null,
        }),
      } as never
    },
  })
}

/** What the handler answers the scripted run with. */
export interface RecordedResponse {
  /** Every header but `connection`, which is the server's, not the route's. */
  headers: Record<string, string>
  body: string
}

/** The response the handler writes for the scripted run. */
export async function recordChatAnswer(): Promise<RecordedResponse> {
  // The first reading is the run's start and every later one its end, so
  // the duration the final progress part carries is fixed.
  let readings = 0
  const handler = createChatHandler({
    loadKnowledgeIndex: () => INDEX,
    readKnowledgeDocument: id => (id === DOCUMENT.id ? DOCUMENT : undefined),
    model: () => scriptedModel(),
    verifyVisitor: async () => ({
      isBot: false,
      isVerifiedBot: false,
      bypassed: false,
    }),
    env: {},
    now: () => (readings++ === 0 ? 1_000 : 1_000 + RECORDED_RUN_MS),
  })

  // The handler logs a metadata line per step and per run; a recording is
  // not a request anyone needs to read about.
  const info = console.info
  console.info = () => {}
  try {
    const response = await handler(
      new Request('https://matttrifilo.com/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'recorded-chat',
          trigger: 'submit-message',
          messages: [
            {
              id: 'recorded-question',
              role: 'user',
              parts: [{ type: 'text', text: 'What does the fixture say?' }],
            },
          ],
        }),
      })
    )
    if (response.status !== 200) {
      throw new Error(
        `the handler refused the recording request: ${response.status} ${await response.text()}`
      )
    }
    const headers: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      if (name !== 'connection') headers[name] = value
    })
    return { headers, body: await response.text() }
  } finally {
    console.info = info
  }
}

if (import.meta.main) {
  const { body } = await recordChatAnswer()
  const file = path.join(__dirname, RECORDED_ANSWER_FILE)
  writeFileSync(file, body)
  console.log(`wrote ${file}`)
}
