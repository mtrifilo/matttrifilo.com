import { describe, expect, test } from 'bun:test'
import { CHAT_UNKNOWN_ERROR_MESSAGE } from './answer'
import {
  RATE_LIMITED_ENVELOPE,
  UNAVAILABLE_ENVELOPE,
  createChatFetch,
} from './transport'

/** A fake fetch that records what it was called with. */
function spyFetch(
  status: number,
  body = 'body',
  type = 'text/plain'
): {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  calls: { input: RequestInfo | URL; init?: RequestInit }[]
  responses: Response[]
} {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = []
  const responses: Response[] = []
  return {
    calls,
    responses,
    fetch: (input, init) => {
      calls.push({ input, init })
      const response = new Response(body, {
        status,
        headers: { 'content-type': type },
      })
      responses.push(response)
      return Promise.resolve(response)
    },
  }
}

describe('createChatFetch', () => {
  test('forwards the request as given and returns the same Response', async () => {
    const spy = spyFetch(200)
    const fetch = createChatFetch(spy.fetch)
    const init = {
      method: 'POST',
      body: '{"messages":[]}',
      headers: { 'content-type': 'application/json' },
    }
    const response = await fetch('/api/chat', init)

    expect(spy.calls).toHaveLength(1)
    expect(spy.calls[0].input).toBe('/api/chat')
    expect(spy.calls[0].init).toMatchObject(init)
    // The very object the fetch produced, so a streaming body is untouched.
    expect(response).toBe(spy.responses[0])
  })

  test.each([400, 403, 502, 503])(
    'passes a %i through untouched',
    async status => {
      const spy = spyFetch(status, 'refusal')
      const response = await createChatFetch(spy.fetch)('/api/chat')
      expect(response).toBe(spy.responses[0])
      expect(await response.text()).toBe('refusal')
    }
  )

  test('gives the WAF edge 429 the envelope the UI renders', async () => {
    // What Vercel's rate-limit rule answers with: a plain body, no JSON.
    const fetch = createChatFetch(spyFetch(429, 'Too Many Requests').fetch)
    const response = await fetch('/api/chat', { method: 'POST' })
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual(RATE_LIMITED_ENVELOPE)
  })

  test('leaves a 429 that already carries an envelope alone', async () => {
    const body = JSON.stringify({
      error: { code: 'rate_limited', message: 'The route said so.' },
    })
    const fetch = createChatFetch(spyFetch(429, body, 'application/json').fetch)
    expect(await (await fetch('/api/chat')).text()).toBe(body)
  })

  test('a 429 with a JSON body that is not an envelope is still rewritten', async () => {
    const fetch = createChatFetch(
      spyFetch(429, '{"message":"slow down"}', 'application/json').fetch
    )
    expect(await (await fetch('/api/chat')).json()).toEqual(
      RATE_LIMITED_ENVELOPE
    )
  })

  test('a request that never produces headers becomes the unavailable envelope', async () => {
    // A hung BotID challenge: the patched fetch never settles, and it does
    // not consult the abort signal while it waits, so nothing but a race
    // against the promise can end the wait.
    const hung = () => new Promise<Response>(() => {})
    const fetch = createChatFetch(hung, { headersTimeoutMs: 10 })
    const response = await fetch('/api/chat', { method: 'POST' })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual(UNAVAILABLE_ENVELOPE)
    expect(UNAVAILABLE_ENVELOPE.error.message).toBe(CHAT_UNKNOWN_ERROR_MESSAGE)
  })

  test('the caller’s own abort is not turned into a refusal', async () => {
    // A request that did start honours the signal, as real fetch does.
    const hung = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('stopped', 'AbortError'))
        )
      })
    const controller = new AbortController()
    const fetch = createChatFetch(hung, { headersTimeoutMs: 1_000 })
    const pending = fetch('/api/chat', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('an already-aborted caller signal aborts before the request is made', async () => {
    const spy = spyFetch(200)
    const controller = new AbortController()
    controller.abort()
    const fetch = createChatFetch(spy.fetch)
    await fetch('/api/chat', { signal: controller.signal })
    expect(spy.calls[0].init?.signal?.aborted).toBe(true)
  })

  test('the headers timer does not fire once headers have arrived', async () => {
    // A slow body after fast headers must never be cut off.
    const spy = spyFetch(200, 'streamed')
    const fetch = createChatFetch(spy.fetch, { headersTimeoutMs: 5 })
    const response = await fetch('/api/chat')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(spy.calls[0].init?.signal?.aborted).toBe(false)
    expect(await response.text()).toBe('streamed')
  })
})
