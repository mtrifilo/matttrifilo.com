import { describe, expect, test } from 'bun:test'
import { RATE_LIMITED_ENVELOPE, withRateLimitEnvelope } from './transport'

const respond =
  (status: number, body: string, type = 'text/plain') =>
  () =>
    Promise.resolve(
      new Response(body, { status, headers: { 'content-type': type } })
    )

describe('withRateLimitEnvelope', () => {
  test('gives the WAF edge 429 the envelope the UI renders', async () => {
    // What Vercel's rate-limit rule answers with: a plain body, no JSON.
    const fetch = withRateLimitEnvelope(respond(429, 'Too Many Requests'))
    const response = await fetch('/api/chat', { method: 'POST' })
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual(RATE_LIMITED_ENVELOPE)
  })

  test('leaves a 429 that already carries an envelope alone', async () => {
    const body = JSON.stringify({
      error: { code: 'rate_limited', message: 'The route said so.' },
    })
    const fetch = withRateLimitEnvelope(respond(429, body, 'application/json'))
    const response = await fetch('/api/chat')
    expect(await response.text()).toBe(body)
  })

  test('passes every other status through untouched', async () => {
    for (const status of [200, 400, 403, 502, 503]) {
      const fetch = withRateLimitEnvelope(respond(status, 'body'))
      const response = await fetch('/api/chat')
      expect(response.status).toBe(status)
      expect(await response.text()).toBe('body')
    }
  })

  test('a 429 with a JSON body that is not an envelope is still rewritten', async () => {
    const fetch = withRateLimitEnvelope(
      respond(429, '{"message":"slow down"}', 'application/json')
    )
    const response = await fetch('/api/chat')
    expect(await response.json()).toEqual(RATE_LIMITED_ENVELOPE)
  })
})
