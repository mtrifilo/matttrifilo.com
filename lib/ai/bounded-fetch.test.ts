import { describe, expect, test } from 'bun:test'
import { CHAT_MAX_STEPS } from '@/lib/chat/validate'
import {
  VERCEL_FUNCTION_LIMIT_MS,
  VERTEX_FIRST_BYTE_TIMEOUT_MS,
  VERTEX_LAST_ATTEMPT_TIMEOUT_MS,
  VERTEX_MAX_ATTEMPTS,
  VERTEX_REQUEST_WAIT_BUDGET_MS,
  VERTEX_RETRY_BACKOFF_MS,
  createBoundedFetch,
  createVertexCallCounter,
  type BoundedFetchRetry,
  type FetchLike,
} from './bounded-fetch'

const URL_UNDER_TEST = 'https://aiplatform.googleapis.com/v1/x:streamGenerate'
const BODY = JSON.stringify({ contents: [] })

/** The options every test shares: fast deadlines, no real backoff waiting. */
function harness(fetchImpl: FetchLike) {
  const retries: BoundedFetchRetry[] = []
  const slept: number[] = []
  const fetch = createBoundedFetch({
    firstByteTimeoutMs: 10,
    lastAttemptTimeoutMs: 20,
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

/**
 * Headers at once and then silence: the shape of the stall the wrapper was
 * written for, on a streaming route. Deliberately not wired to the abort
 * signal — the deadline has to end this wait on its own, whatever the
 * transport does.
 */
function headersThenSilence(): FetchLike {
  return async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull: () => new Promise<void>(() => {}),
      })
    )
}

/**
 * Never answers and never listens for the abort: a connection stuck in DNS,
 * in connect or in the handshake, where no response object exists yet for the
 * body phase to race. The deadline has to end this wait without the
 * transport's help, exactly as it does for a silent body.
 */
function deafToAbort(): FetchLike {
  return () => new Promise<Response>(() => {})
}

/**
 * Answers only once the abort has fired, with a live body: a transport that
 * reads the cancellation as a request to finish rather than to stop.
 */
function answersAfterAbort(onCancel: () => void): FetchLike {
  return (_input, init) =>
    new Promise<Response>(resolve => {
      init?.signal?.addEventListener(
        'abort',
        () =>
          resolve(
            new Response(new ReadableStream<Uint8Array>({ cancel: onCancel }))
          ),
        { once: true }
      )
    })
}

const encode = (text: string) => new TextEncoder().encode(text)

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
      { attempt: 1, firstByteTimeoutMs: 10, backoffMs: 1, attemptsLeft: 1 },
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
    expect(retries.map(r => r.attempt)).toEqual([1])
    expect(retries.map(r => r.attemptsLeft)).toEqual([1])
    expect(slept).toEqual([1])
  })

  test('the last attempt is given the larger deadline', async () => {
    // The point of the split: the earlier attempts probe for a stall on a
    // guess, the last one is allowed to be slow rather than failing an
    // answer the visitor is waiting for.
    const aborted = { count: 0 }
    const deadlines: number[] = []
    const { fetch, retries } = harness((_input, init) => {
      init?.signal?.addEventListener('abort', () => {
        deadlines.push(Date.now())
      })
      return stalls(aborted)(_input, init)
    })

    const started = Date.now()
    await expect(
      fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    ).rejects.toMatchObject({ name: 'TimeoutError' })

    // The harness gives 10 ms to the first attempt and 20 ms to the last.
    expect(retries[0].firstByteTimeoutMs).toBe(10)
    expect(deadlines[1] - started).toBeGreaterThanOrEqual(25)
  })

  test('headers that arrive with no body behind them are still a stall', async () => {
    // A 200 and its headers within the deadline prove nothing on an SSE
    // route: the connection can then say nothing for the rest of the
    // function's life, which is exactly the episode's shape.
    let calls = 0
    const { fetch, retries } = harness((input, init) => {
      calls += 1
      return calls === 1
        ? headersThenSilence()(input, init)
        : answers(input, init)
    })

    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })

    expect(await response.text()).toBe('ok')
    expect(calls).toBe(2)
    expect(retries.map(r => r.attempt)).toEqual([1])
  })

  test('a body that says nothing on every attempt fails as a timeout', async () => {
    let calls = 0
    const { fetch } = harness((input, init) => {
      calls += 1
      return headersThenSilence()(input, init)
    })

    await expect(
      fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(calls).toBe(VERTEX_MAX_ATTEMPTS)
  })

  test('a transport that ignores the abort is still cut at the deadline', async () => {
    // The headers phase has no response to race, so for a while nothing but
    // the transport's own cooperation ended this wait. A connection stuck
    // before any response exists does not cooperate, and the attempt then had
    // no ceiling at all.
    let calls = 0
    const { fetch, retries } = harness((input, init) => {
      calls += 1
      return calls === 1 ? deafToAbort()(input, init) : answers(input, init)
    })

    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })

    expect(await response.text()).toBe('ok')
    expect(calls).toBe(2)
    expect(retries.map(r => r.attempt)).toEqual([1])
  })

  test('the elapsed a failure reports cannot outrun its own deadlines', async () => {
    // The reading this pins: two attempts bounded at 10 and 20 ms reporting
    // an elapsed hundreds of times their sum, because the abort fired on time
    // and the wait on it did not end. An elapsed far past the ceilings is not
    // a slow model, it is a ceiling that was reported rather than enforced.
    const { fetch } = harness(deafToAbort())
    const started = Date.now()

    const error = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
      .then(() => new Error('the wrapper resolved instead of timing out'))
      .catch((thrown: Error) => thrown)

    expect(error.name).toBe('TimeoutError')
    const reported = Number(/in (\d+) ms/.exec(error.message)?.[1])
    // Loose on purpose against the harness's 30 ms of deadlines: what fails
    // here is an unenforced ceiling, never a busy machine.
    expect(reported).toBeLessThan(5_000)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  test('a response that arrives after its deadline has its body cancelled', async () => {
    // An unread stream holds the abandoned connection open for the rest of the
    // function's life, which is the cost this wrapper exists to stop paying.
    let cancelled = false
    let calls = 0
    const { fetch } = harness((input, init) => {
      calls += 1
      return calls === 1
        ? answersAfterAbort(() => {
            cancelled = true
          })(input, init)
        : answers(input, init)
    })

    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })

    expect(await response.text()).toBe('ok')
    expect(calls).toBe(2)
    expect(cancelled).toBe(true)
  })

  test('once the first chunk has arrived, a slow body is never cut', async () => {
    // The stream is the visitor's answer arriving: replaying it would send a
    // partial answer twice, and aborting it would cut one off mid-sentence.
    // So the deadline dies with the first chunk, however long the rest takes.
    let calls = 0
    let bodyAborted = false
    const { fetch, retries } = harness(async (_input, init) => {
      calls += 1
      init?.signal?.addEventListener('abort', () => {
        bodyAborted = true
      })
      let chunk = 0
      return new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            chunk += 1
            if (chunk === 1) return controller.enqueue(encode('an'))
            // Far longer than either deadline in the harness.
            await Bun.sleep(60)
            controller.enqueue(encode('swer'))
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

  test('the response the caller gets keeps its status and headers', async () => {
    const { fetch } = harness(
      async () =>
        new Response(new Blob([encode('stream')]).stream(), {
          status: 201,
          statusText: 'Created',
          headers: { 'content-type': 'text/event-stream' },
        })
    )

    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(await response.text()).toBe('stream')
  })

  test('a response with no body at all passes straight through', async () => {
    const { fetch } = harness(async () => new Response(null, { status: 204 }))
    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })

  test('an empty body is a finished call, not a stall', async () => {
    const { fetch, retries } = harness(async () => new Response(''))
    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    expect(await response.text()).toBe('')
    expect(retries).toEqual([])
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

  test('a disconnect while waiting for the first chunk is the disconnect', async () => {
    // Both signals can end this wait, and the visitor's reason is the one
    // that has to survive: the request is over, not worth another connection.
    let calls = 0
    const { fetch, retries } = harness((input, init) => {
      calls += 1
      return headersThenSilence()(input, init)
    })

    const visitor = new AbortController()
    const pending = fetch(URL_UNDER_TEST, {
      method: 'POST',
      body: BODY,
      signal: visitor.signal,
    })
    await Bun.sleep(1)
    visitor.abort(new Error('client closed'))

    await expect(pending).rejects.toThrow('client closed')
    expect(calls).toBe(1)
    expect(retries).toEqual([])
  })

  test('a stall behind a caller signal still retries through the merged one', async () => {
    // The composite signal path: with a caller signal attached, the deadline
    // reaches the connection through AbortSignal.any, and a stall under it is
    // still a stall rather than a disconnect.
    const aborted = { count: 0 }
    const stall = stalls(aborted)
    let calls = 0
    const { fetch, retries } = harness((input, init) => {
      calls += 1
      return calls === 1 ? stall(input, init) : answers(input, init)
    })

    const visitor = new AbortController()
    const response = await fetch(URL_UNDER_TEST, {
      method: 'POST',
      body: BODY,
      signal: visitor.signal,
    })

    expect(await response.text()).toBe('ok')
    expect(aborted.count).toBe(1)
    expect(calls).toBe(2)
    expect(retries.map(r => r.attempt)).toEqual([1])
    expect(visitor.signal.aborted).toBe(false)
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

  test('a zero-length first chunk is not a first byte', async () => {
    // A transport can open a stream with an empty frame — a keep-alive, a
    // flushed-but-empty write. Letting that clear the deadline would hand the
    // stall a way to look like an answer: the connection has said nothing.
    let calls = 0
    const { fetch } = harness(async () => {
      calls += 1
      let chunk = 0
      return new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            chunk += 1
            if (chunk === 1) return controller.enqueue(new Uint8Array(0))
            // Longer than either deadline in the harness: if the empty chunk
            // counted, this body would be let through and this would resolve.
            await Bun.sleep(60)
            controller.enqueue(encode('late'))
            controller.close()
          },
        })
      )
    })

    await expect(
      fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(calls).toBe(VERTEX_MAX_ATTEMPTS)
  })

  test('a non-2xx with a slow error body is handed back, not retried', async () => {
    // The SDK reads response.ok only once it has the response, so a 429 held
    // back here would be abandoned as a stall and retried — burning a second
    // connection on a rate limit and hiding it from the layer that knows how
    // to back off.
    let calls = 0
    const { fetch, retries } = harness(async () => {
      calls += 1
      return new Response(
        new ReadableStream<Uint8Array>({
          // The error body never arrives; the response itself still must.
          pull: () => new Promise<void>(() => {}),
        }),
        { status: 429, statusText: 'Too Many Requests' }
      )
    })

    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })

    expect(response.status).toBe(429)
    expect(calls).toBe(1)
    expect(retries).toEqual([])
  })

  test('the timeout says what the whole call spent, not the last deadline', async () => {
    // The message must cover the first attempt and the backoff as well as
    // the final 20 ms ceiling. Measured with real timers the total is
    // "about 30" and CI reported 29 once, so the clock is injected instead:
    // each attempt advances it by its deadline and the backoff by its sleep,
    // which makes the figure exactly 10 + 1 + 20 = 31. A regression that
    // reported only the last attempt (20), only the first (10), or dropped
    // the backoff (30) fails on the exact value.
    let clock = 0
    const deadlines = [10, 20]
    let calls = 0
    const aborted = { count: 0 }
    const stall = stalls(aborted)
    const fetch = createBoundedFetch({
      firstByteTimeoutMs: deadlines[0],
      lastAttemptTimeoutMs: deadlines[1],
      backoffMs: [1, 2],
      fetchImpl: (input, init) => {
        clock += deadlines[calls] ?? 0
        calls += 1
        return stall(input, init)
      },
      sleep: async ms => {
        clock += ms
      },
      now: () => clock,
    })

    const message = await fetch(URL_UNDER_TEST, {
      method: 'POST',
      body: BODY,
    }).then(
      () => 'the call resolved instead of timing out',
      (error: Error) => error.message
    )

    expect(message).toBe(
      'Vertex sent no response byte in 31 ms across 2 attempt(s)'
    )
    expect(aborted.count).toBe(2)
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

describe('the backoff the wrapper waits by default', () => {
  /** No `sleep` injected: these exercise the module's own delay(). */
  function realBackoff(fetchImpl: FetchLike, onRetry: () => void = () => {}) {
    return createBoundedFetch({
      firstByteTimeoutMs: 10,
      lastAttemptTimeoutMs: 20,
      backoffMs: [30],
      fetchImpl,
      onRetry,
    })
  }

  test('it is waited out and the next attempt follows it', async () => {
    const aborted = { count: 0 }
    const stall = stalls(aborted)
    let calls = 0
    const fetch = realBackoff((input, init) => {
      calls += 1
      return calls === 1 ? stall(input, init) : answers(input, init)
    })

    const started = Date.now()
    const response = await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })

    expect(await response.text()).toBe('ok')
    expect(Date.now() - started).toBeGreaterThanOrEqual(30)
  })

  test('a disconnect during it is not waited out', async () => {
    // The visitor is gone; spending the rest of the backoff before noticing
    // would hold the function open for nobody.
    const aborted = { count: 0 }
    const stall = stalls(aborted)
    let calls = 0
    const visitor = new AbortController()
    const fetch = realBackoff(
      (input, init) => {
        calls += 1
        return stall(input, init)
      },
      // Aborting from a microtask lands inside the sleep rather than before
      // it, so this is the listener path of delay(), not its early return.
      () => queueMicrotask(() => visitor.abort(new Error('client closed')))
    )

    const started = Date.now()
    await expect(
      fetch(URL_UNDER_TEST, {
        method: 'POST',
        body: BODY,
        signal: visitor.signal,
      })
    ).rejects.toThrow('client closed')

    expect(calls).toBe(1)
    expect(Date.now() - started).toBeLessThan(30)
  })

  test('a disconnect already made before it is not slept on at all', async () => {
    const aborted = { count: 0 }
    const stall = stalls(aborted)
    const visitor = new AbortController()
    const fetch = realBackoff(
      (input, init) => stall(input, init),
      () => visitor.abort(new Error('client closed'))
    )

    await expect(
      fetch(URL_UNDER_TEST, {
        method: 'POST',
        body: BODY,
        signal: visitor.signal,
      })
    ).rejects.toThrow('client closed')
  })
})

describe('createVertexCallCounter', () => {
  test('counts the retries a request could not otherwise see', async () => {
    const counter = createVertexCallCounter()
    const aborted = { count: 0 }
    const stall = stalls(aborted)
    let calls = 0
    const fetch = createBoundedFetch({
      firstByteTimeoutMs: 10,
      lastAttemptTimeoutMs: 20,
      backoffMs: [1],
      sleep: async () => {},
      onRetry: counter.observeRetry,
      fetchImpl: (input, init) => {
        calls += 1
        return calls === 1 ? stall(input, init) : answers(input, init)
      },
    })

    expect(counter.retries()).toBe(0)
    await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    expect(counter.retries()).toBe(1)
  })

  test('records how long each call waited for its first byte', async () => {
    // The number VERTEX_FIRST_BYTE_TIMEOUT_MS is a guess at. Measured from
    // the request to the first body byte of the attempt that produced one —
    // so a clock that only moves inside the transport is enough to pin it.
    const counter = createVertexCallCounter()
    let clock = 0
    let waitMs = 7
    const fetch = createBoundedFetch({
      fetchImpl: async () => {
        clock += waitMs
        return new Response('ok')
      },
      onFirstByte: counter.observeFirstByte,
      now: () => clock,
    })

    expect(counter.firstByteMs()).toBe(0)
    await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    expect(counter.firstByteMs()).toBe(7)

    // The slowest call on the request, not the last: a fast final step must
    // not erase the step that came near the deadline.
    waitMs = 900
    await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    waitMs = 3
    await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })
    expect(counter.firstByteMs()).toBe(900)
  })

  test('a stalled attempt reports no first byte, only the one that answers', async () => {
    const counter = createVertexCallCounter()
    const aborted = { count: 0 }
    const stall = stalls(aborted)
    const firstBytes: number[] = []
    let calls = 0
    const fetch = createBoundedFetch({
      firstByteTimeoutMs: 10,
      lastAttemptTimeoutMs: 20,
      backoffMs: [1],
      sleep: async () => {},
      onRetry: counter.observeRetry,
      onFirstByte: ms => {
        firstBytes.push(ms)
        counter.observeFirstByte(ms)
      },
      fetchImpl: (input, init) => {
        calls += 1
        return calls === 1 ? stall(input, init) : answers(input, init)
      },
    })

    await fetch(URL_UNDER_TEST, { method: 'POST', body: BODY })

    expect(firstBytes).toHaveLength(1)
    expect(counter.retries()).toBe(1)
  })
})

/**
 * The sample the two deadlines are calibrated against: `vertexFirstByteMs` on
 * 514 chat requests over 1,136 model calls, in the six eval runs named in
 * bounded-fetch.ts, read 2026-09-22. Named here so the assertions below cite
 * one figure each rather than repeating a literal, and so a recalibration is a
 * two-line edit whose consequences the tests spell out.
 */
const MEASURED_P99_MS = 26_838
const MEASURED_MAX_MS = 35_970

describe('the constants the 300 s function limit allows', () => {
  /** Every attempt before the last stalls, then the last one runs long. */
  const worstCasePerModelCall =
    VERTEX_FIRST_BYTE_TIMEOUT_MS * (VERTEX_MAX_ATTEMPTS - 1) +
    Array.from(
      { length: VERTEX_MAX_ATTEMPTS - 1 },
      (_, i) =>
        VERTEX_RETRY_BACKOFF_MS[i] ?? VERTEX_RETRY_BACKOFF_MS.at(-1) ?? 0
    ).reduce((a, b) => a + b, 0) +
    VERTEX_LAST_ATTEMPT_TIMEOUT_MS

  test('the worst case a chat request can actually reach fits the budget', () => {
    // CHAT_MAX_STEPS imported, not written as 4: the number is derived from
    // KNOWLEDGE_READ_BUDGET and this arithmetic has to fail here rather than
    // in production if it moves.
    expect(worstCasePerModelCall * CHAT_MAX_STEPS).toBeLessThanOrEqual(
      VERTEX_REQUEST_WAIT_BUDGET_MS
    )
    expect(VERTEX_REQUEST_WAIT_BUDGET_MS).toBeLessThan(VERCEL_FUNCTION_LIMIT_MS)
  })

  test('the budget leaves the function room for what the wrapper cannot bound', () => {
    // The generation after the first byte, the token exchange, and the
    // platform's own overhead are all outside the waiting budget.
    expect(VERCEL_FUNCTION_LIMIT_MS - VERTEX_REQUEST_WAIT_BUDGET_MS).toBe(
      30_000
    )
  })

  test('the SDK can still wrap the wrapper, and that is not bounded here', () => {
    // retryWithExponentialBackoff (maxRetries = 2) rethrows abort-named
    // errors, so our stall path is never multiplied — but a retryable API
    // error above us re-enters this wrapper with a fresh budget. Three of
    // those is over the limit, and nothing here prevents it: the lever is
    // `maxRetries` on the streamText call, left at its default deliberately
    // (see bounded-fetch.ts). Written as a test so the gap is asserted
    // rather than only described.
    const sdkAttempts = 1 + 2
    expect(
      worstCasePerModelCall * CHAT_MAX_STEPS * sdkAttempts
    ).toBeGreaterThan(VERCEL_FUNCTION_LIMIT_MS)
  })

  test('the fast bound sits above the measured p99 of a healthy step', () => {
    // 514 requests over six eval runs, 2026-09-16 to 2026-09-21 (the run ids
    // are in bounded-fetch.ts): p95 22,051 ms, p99 26,838. A probe below p99
    // spends a second billed generation on steps that were only slow, so the
    // measurement is the floor.
    expect(VERTEX_FIRST_BYTE_TIMEOUT_MS).toBeGreaterThan(MEASURED_P99_MS)
    // And below the point where a stall is unmistakable: healthy calls on
    // this deployment never approached 80 s, stalled ones sat at 80 to 110.
    expect(VERTEX_FIRST_BYTE_TIMEOUT_MS).toBeLessThan(80_000)
  })

  test('the last attempt clears the slowest first byte measured', () => {
    // A ceiling under the slowest measured wait turns a slow answer into no
    // answer, which is the one outcome this attempt has no retry to cover.
    expect(VERTEX_LAST_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(MEASURED_MAX_MS)
    expect(VERTEX_LAST_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(
      VERTEX_FIRST_BYTE_TIMEOUT_MS
    )
  })

  test('the two bounds still fit inside the per-call budget together', () => {
    // The two tests above set a floor under each bound and the budget test
    // sets a ceiling over their sum, which is the whole feasible region. It is
    // asserted rather than left implied, because a future recalibration that
    // raises one floor past the room the other leaves has no valid answer and
    // should fail here rather than in the arithmetic.
    expect(
      MEASURED_P99_MS + VERTEX_RETRY_BACKOFF_MS[0] + MEASURED_MAX_MS
    ).toBeLessThan(VERTEX_REQUEST_WAIT_BUDGET_MS / CHAT_MAX_STEPS)
  })
})
