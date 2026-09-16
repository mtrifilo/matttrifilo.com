import { describe, expect, test } from 'bun:test'
import {
  VERTEX_HEADERS_TIMEOUT_MS,
  VERTEX_MAX_ATTEMPTS,
  VERTEX_RETRY_BACKOFF_MS,
  createBoundedFetch,
  type BoundedFetchRetry,
  type FetchLike,
} from './bounded-fetch'

const URL_UNDER_TEST = 'https://aiplatform.googleapis.com/v1/x:streamGenerate'
const BODY = JSON.stringify({ contents: [] })

/** The options every test shares: fast timeout, no real backoff waiting. */
function harness(fetchImpl: FetchLike) {
  const retries: BoundedFetchRetry[] = []
  const slept: number[] = []
  const fetch = createBoundedFetch({
    headersTimeoutMs: 10,
    backoffMs: [1, 2],
    fetchImpl,
    sleep: async ms => {
      slept.push(ms)
    },
    onRetry: retry => {
      retries.push(retry)
    },
  })
  return { fetch, retries, slept }
}

/** A call that never answers, and reports whether it saw the abort. */
function stalls(aborted: { count: number }): FetchLike {
  return (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => {
          aborted.count += 1
          reject(init.signal?.reason ?? new Error('aborted'))
        },
        { once: true }
      )
    })
}

/** A call that answers immediately. */
const answers: FetchLike = async () => new Response('ok')

describe('createBoundedFetch', () => {
  test('a call that sends no headers in time is abandoned', async () => {
    const aborted = { count: 0 }
    const { fetch } = harness(stalls(aborted))
    await expect(
      fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(aborted.count).toBe(VERTEX_MAX_ATTEMPTS)
  })

  test('a stall is retried and the next attempt succeeds', async () => {
    const aborted = { count: 0 }
    const stall = stalls(aborted)
    let calls = 0
    const { fetch, retries, slept } = harness((input, init) => {
      calls += 1
      return calls === 1 ? stall(input, init) : answers(input, init)
    })

    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })

    expect(await response.text()).toBe('ok')
    expect(calls).toBe(2)
    expect(slept).toEqual([1])
    expect(retries).toEqual([
      { attempt: 1, headersTimeoutMs: 10, backoffMs: 1, attemptsLeft: 2 },
    ])
  })

  test('retries are capped and the numbers are logged once each', async () => {
    const aborted = { count: 0 }
    let calls = 0
    const stall = stalls(aborted)
    const { fetch, retries, slept } = harness((input, init) => {
      calls += 1
      return stall(input, init)
    })

    await expect(
      fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    ).rejects.toMatchObject({ name: 'TimeoutError' })

    expect(calls).toBe(VERTEX_MAX_ATTEMPTS)
    expect(retries.map(r => r.attempt)).toEqual([1, 2])
    expect(retries.map(r => r.attemptsLeft)).toEqual([2, 1])
    expect(slept).toEqual([1, 2])
  })

  test('once response headers arrive, nothing is retried or aborted', async () => {
    // The stream is the visitor's answer arriving: replaying it would send a
    // partial answer twice, and aborting it would cut one off mid-sentence.
    let calls = 0
    let bodyAborted = false
    const { fetch, retries } = harness(async (_input, init) => {
      calls += 1
      init?.signal?.addEventListener('abort', () => {
        bodyAborted = true
      })
      return new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            await Bun.sleep(30) // longer than the 10 ms headers timeout
            controller.enqueue(new TextEncoder().encode('answer'))
            controller.close()
          },
        })
      )
    })

    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    expect(await response.text()).toBe('answer')
    expect(calls).toBe(1)
    expect(retries).toEqual([])
    expect(bodyAborted).toBe(false)
  })

  test('a visitor disconnect propagates immediately and is never retried', async () => {
    const aborted = { count: 0 }
    let calls = 0
    const stall = stalls(aborted)
    const { fetch, retries } = harness((input, init) => {
      calls += 1
      return stall(input, init)
    })

    const visitor = new AbortController()
    const pending = fetch(URL_UNDER_TEST, {
      method: 'POST',
      body: BODY,
      signal: visitor.signal,
    })
    visitor.abort(new Error('client closed'))

    await expect(pending).rejects.toThrow('client closed')
    expect(calls).toBe(1)
    expect(retries).toEqual([])
  })

  test('a disconnect before the first attempt does not open a connection', async () => {
    let calls = 0
    const { fetch } = harness((input, init) => {
      calls += 1
      return answers(input, init)
    })
    const visitor = new AbortController()
    visitor.abort(new Error('client closed'))

    await expect(
      fetch(URL_UNDER_TEST, { body: BODY, signal: visitor.signal })
    ).rejects.toThrow('client closed')
    expect(calls).toBe(0)
  })

  test('errors that are not a stall are left to the SDK to classify', async () => {
    // Connection refused, a 5xx handler throwing, a DNS failure: the SDK
    // already retries those on its own terms, so a second layer here would
    // multiply the attempts rather than add resilience.
    let calls = 0
    const { fetch, retries } = harness(async () => {
      calls += 1
      throw new TypeError('fetch failed')
    })

    await expect(
      fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    ).rejects.toThrow('fetch failed')
    expect(calls).toBe(1)
    expect(retries).toEqual([])
  })

  test('a body that can only be read once is never sent twice', async () => {
    const aborted = { count: 0 }
    let calls = 0
    const stall = stalls(aborted)
    const { fetch, retries } = harness((input, init) => {
      calls += 1
      return stall(input, init)
    })

    const once = new ReadableStream<Uint8Array>({
      start: controller => controller.close(),
    })
    await expect(
      fetch(URL_UNDER_TEST, {
        method: 'POST',
        body: once,
        // @ts-expect-error duplex is required for a stream body at runtime
        // and is not in the lib.dom RequestInit this repo compiles against.
        duplex: 'half',
      })
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(calls).toBe(1)
    expect(retries).toEqual([])
  })

  test('the caller sees the request it made, minus our signal swap', async () => {
    let seen: RequestInit | undefined
    const { fetch } = harness(async (_input, init) => {
      seen = init
      return new Response('ok')
    })
    await fetch(URL_UNDER_TEST, {
      method: 'POST',
      body: BODY,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(seen?.method).toBe('POST')
    expect(seen?.body).toBe(BODY)
    expect(seen?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(seen?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('the constants the 300 s function limit allows', () => {
  test('the worst case for a four-step chat request stays inside the limit', () => {
    // CHAT_MAX_STEPS = KNOWLEDGE_READ_BUDGET.maxDocuments + 1 = 4 model calls
    // per request, each of which may burn every attempt before failing.
    const perCall =
      VERTEX_HEADERS_TIMEOUT_MS * VERTEX_MAX_ATTEMPTS +
      VERTEX_RETRY_BACKOFF_MS.reduce((a, b) => a + b, 0)
    expect(perCall * 4).toBeLessThan(300_000)
  })

  test('the headers timeout sits between healthy calls and the observed stalls', () => {
    // Healthy: 1 to 14 s end to end. Stalled: 80 to 110 s.
    expect(VERTEX_HEADERS_TIMEOUT_MS).toBeGreaterThan(14_000)
    expect(VERTEX_HEADERS_TIMEOUT_MS).toBeLessThan(80_000)
  })
})
