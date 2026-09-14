import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import type { KnowledgeBase } from '@/lib/knowledge'
import { cachedInputTokens, createChatHandler } from './handler'
import { SYSTEM_PROMPT } from './prompt'
import { CHAT_MAX_MESSAGE_CHARS, CHAT_MAX_TURNS } from './validate'

const QUESTION = 'What did Matt build at Thryv?'
const ANSWER = 'He led the platform migration.'

const kb: KnowledgeBase = {
  text: '[resume-thryv]\nMatt led the platform migration at Thryv.',
  sections: [],
  tokenEstimate: 20,
  builtAt: '2026-09-14T00:00:00.000Z',
}

const usage = {
  inputTokens: {
    total: 5_000,
    noCache: 1_000,
    cacheRead: 4_000,
    cacheWrite: 0,
  },
  outputTokens: { total: 42, text: 30, reasoning: 12 },
}

/** A model that streams one short answer and reports a cache hit. */
function streamingModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: '1' },
          { type: 'text-delta' as const, id: '1', delta: ANSWER },
          { type: 'text-end' as const, id: '1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'STOP' },
            usage,
            providerMetadata: {
              google: { usageMetadata: { cachedContentTokenCount: 4_000 } },
            },
          },
        ],
        chunkDelayInMs: null,
        initialDelayInMs: null,
      }),
    }),
  })
}

const uiMessage = (role: 'user' | 'assistant', text: string) => ({
  id: `${role}-${text.length}`,
  role,
  parts: [{ type: 'text', text }],
})

const post = (body: unknown) =>
  new Request('https://matttrifilo.com/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Everything written to the console during one handler call. */
let logged: unknown[][]
const realConsole = {
  info: console.info,
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
}

beforeEach(() => {
  logged = []
  for (const level of ['info', 'log', 'warn', 'error', 'debug'] as const) {
    console[level] = (...args: unknown[]) => {
      logged.push(args)
    }
  }
})

afterEach(() => {
  Object.assign(console, realConsole)
})

const loggedText = () =>
  logged
    .map(args =>
      args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    )
    .join('\n')

const handlerWith = (
  model: MockLanguageModelV4,
  env: Record<string, string | undefined> = {}
) =>
  createChatHandler({
    loadKnowledgeBase: () => kb,
    model: () => model,
    env,
    now: () => 1_000,
  })

describe('kill switch', () => {
  test('CHAT_DISABLED=1 returns 503 and never calls the model', async () => {
    const model = streamingModel()
    const response = await handlerWith(model, { CHAT_DISABLED: '1' })(
      post({ messages: [uiMessage('user', QUESTION)] })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: { code: 'disabled', message: expect.any(String) },
    })
    expect(model.doStreamCalls).toHaveLength(0)
  })

  test('the knowledge base is not even loaded when chat is off', async () => {
    let loads = 0
    const handler = createChatHandler({
      loadKnowledgeBase: () => {
        loads += 1
        return kb
      },
      model: () => streamingModel(),
      env: { CHAT_DISABLED: '1' },
    })
    await handler(post({ messages: [uiMessage('user', QUESTION)] }))
    expect(loads).toBe(0)
  })
})

describe('rejections', () => {
  test('too many turns returns 400 and never calls the model', async () => {
    const model = streamingModel()
    const messages = Array.from({ length: CHAT_MAX_TURNS + 1 }, (_, i) =>
      uiMessage('user', `question ${i}`)
    )

    const response = await handlerWith(model)(post({ messages }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { code: 'too_many_turns', message: expect.any(String) },
    })
    expect(model.doStreamCalls).toHaveLength(0)
  })

  test('an over-long message returns 400', async () => {
    const model = streamingModel()
    const response = await handlerWith(model)(
      post({
        messages: [uiMessage('user', 'x'.repeat(CHAT_MAX_MESSAGE_CHARS + 1))],
      })
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('message_too_long')
    expect(model.doStreamCalls).toHaveLength(0)
  })

  test('a body that is not JSON returns 400 invalid', async () => {
    const model = streamingModel()
    const response = await handlerWith(model)(
      new Request('https://matttrifilo.com/api/chat', {
        method: 'POST',
        body: 'not json',
      })
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('invalid')
    expect(model.doStreamCalls).toHaveLength(0)
  })
})

describe('a normal request', () => {
  test('streams a UI message stream back', async () => {
    const model = streamingModel()
    const response = await handlerWith(model)(
      post({ messages: [uiMessage('user', QUESTION)] })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1')

    const body = await response.text()
    expect(body).toContain(ANSWER)
    expect(body).toContain('data: [DONE]')
  })

  test('sends the policy and knowledge base ahead of the question', async () => {
    const model = streamingModel()
    const response = await handlerWith(model)(
      post({
        messages: [
          uiMessage('user', 'first question'),
          uiMessage('assistant', 'first answer'),
          uiMessage('user', QUESTION),
        ],
      })
    )
    await response.text()

    const call = model.doStreamCalls[0]
    const prompt = call.prompt
    expect(prompt[0].role).toBe('system')
    expect(prompt[1].role).toBe('system')
    expect(prompt[0].content).toBe(SYSTEM_PROMPT)
    expect(String(prompt[1].content)).toContain(kb.text)
    expect(prompt.slice(2).map(m => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ])
  })

  test('applies the documented call settings and offers no tools', async () => {
    const model = streamingModel()
    const response = await handlerWith(model)(
      post({ messages: [uiMessage('user', QUESTION)] })
    )
    await response.text()

    const call = model.doStreamCalls[0]
    expect(call.temperature).toBe(0.2)
    expect(call.maxOutputTokens).toBe(600)
    expect(call.reasoning).toBe('none')
    expect(call.tools ?? []).toHaveLength(0)
  })
})

describe('logging', () => {
  test('logs aggregate numbers, including the cache hit and duration', async () => {
    const response = await handlerWith(streamingModel())(
      post({ messages: [uiMessage('user', QUESTION)] })
    )
    await response.text()

    const entry = logged.find(args => args[0] === '[chat]')
    expect(entry).toBeDefined()
    expect(entry?.[1]).toMatchObject({
      inputTokens: 5_000,
      outputTokens: 42,
      reasoningTokens: 12,
      cachedInputTokens: 4_000,
      cacheHit: true,
      finishReason: 'stop',
      ms: 0,
    })
  })

  test('no message text reaches the console', async () => {
    const response = await handlerWith(streamingModel())(
      post({
        messages: [
          uiMessage('user', 'an earlier question about Matt'),
          uiMessage('assistant', 'an earlier answer about Matt'),
          uiMessage('user', QUESTION),
        ],
      })
    )
    await response.text()

    const text = loggedText()
    expect(text.length).toBeGreaterThan(0)
    for (const secret of [
      QUESTION,
      ANSWER,
      'an earlier question about Matt',
      'an earlier answer about Matt',
      kb.text,
      SYSTEM_PROMPT,
    ]) {
      expect(text).not.toContain(secret)
    }
  })

  test('a failure before the stream logs a stage but no provider text', async () => {
    const secret = 'model gemini-3.8-flash refused prompt: ' + QUESTION
    const handler = createChatHandler({
      loadKnowledgeBase: () => kb,
      model: () => {
        throw new Error(secret)
      },
      env: {},
    })

    const response = await handler(
      post({ messages: [uiMessage('user', QUESTION)] })
    )

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error.code).toBe('unavailable')
    expect(JSON.stringify(body)).not.toContain(QUESTION)

    const text = loggedText()
    expect(text).toContain('"stage":"model"')
    expect(text).not.toContain(secret)
    expect(text).not.toContain(QUESTION)
  })

  test('a missing-config failure is classified before it is logged', async () => {
    const handler = createChatHandler({
      loadKnowledgeBase: () => kb,
      model: () => {
        throw new Error('GCP_PROJECT_ID is not set; run `vercel env pull`')
      },
      env: {},
    })
    const response = await handler(
      post({ messages: [uiMessage('user', QUESTION)] })
    )

    expect(response.status).toBe(502)
    expect(loggedText()).toContain('"stage":"config"')
  })
})

describe('cachedInputTokens', () => {
  test('prefers the AI SDK usage mapping', () => {
    expect(
      cachedInputTokens(
        {
          inputTokenDetails: {
            noCacheTokens: 1,
            cacheReadTokens: 7,
            cacheWriteTokens: 0,
          },
        },
        { google: { usageMetadata: { cachedContentTokenCount: 99 } } }
      )
    ).toBe(7)
  })

  test('falls back to the provider metadata', () => {
    expect(
      cachedInputTokens(undefined, {
        google: { usageMetadata: { cachedContentTokenCount: 99 } },
      })
    ).toBe(99)
  })

  test('is zero when neither source reports a cache read', () => {
    expect(cachedInputTokens(undefined, undefined)).toBe(0)
    expect(cachedInputTokens(undefined, { google: {} })).toBe(0)
  })
})
