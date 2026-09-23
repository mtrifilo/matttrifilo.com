/**
 * A fetch wrapper that bounds and retries a stalled Vertex call (MTC-38).
 *
 * The episode this exists for: on one preview, every model call took 80 to
 * 110 s regardless of size, a 1,700-token call that produced 16 tokens took
 * as long as a real answer, while the same call from a laptop through the
 * same identity pool took 1 to 2 s, and the token exchange measured near
 * zero. The connection was opening and then producing nothing. Two requests
 * spent 130 s and 290 s that way, the second hitting Vercel's 300 s function
 * limit with no answer at all.
 *
 * Why a fetch wrapper and not the SDK's `timeout`: the SDK turns its timeout
 * into an abort, and `retryWithExponentialBackoff` rethrows anything
 * `isAbortError` matches before it ever consults `shouldRetry`
 * (node_modules/@ai-sdk/provider-utils/dist/index.js). A timeout there ends
 * the request; it does not get a second connection. Retrying has to happen
 * below the SDK, and the Vertex provider takes a custom `fetch` for exactly
 * this kind of middleware.
 *
 * What it bounds is time to the first response *byte*, not the whole call.
 * Response headers are not enough: the chat route streams, and an SSE
 * response can send 200 and its headers promptly and then emit nothing for
 * the rest of the function's life, which is the shape of the stall this
 * wrapper was written for. So the deadline covers headers *and* the first
 * body chunk, and only the arrival of that chunk clears it. After it, the
 * body passes through untouched and nothing here ever cuts it: a long answer
 * streaming is the model working, and the visitor is already reading it.
 *
 * Retrying is safe only in the same narrow sense, and the sense matters:
 * before the first byte nothing has reached the visitor, so a second
 * connection is invisible *to them*. It is not invisible to Vertex and not
 * free. Abandoning a connection does not cancel the generation behind it, so
 * a retry can re-run a generation that is still executing and be billed for
 * both: visitor visibility is not idempotency. That is the price of the
 * bound, it is why the attempt count is small, and it is why every retry is
 * counted into the request's own log line (`vertexRetries` on `[chat]`,
 * `retries` on the health route) rather than hidden.
 *
 * One bound this cannot enforce: the SDK's own `retryWithExponentialBackoff`
 * (maxRetries = 2 by default) wraps this wrapper. Our stall error is
 * abort-named, so that loop rethrows it untouched and never multiplies the
 * stall path, but a *retryable API error* (a 429, a 5xx) is retried up to
 * twice above us, and each of those attempts gets this wrapper's full
 * per-call budget again. A call that both stalls and then fails with a
 * retryable error can therefore cost up to three times the per-call
 * arithmetic below. The lever that bounds it is `maxRetries` on the
 * `streamText` call in lib/chat/handler.ts (the SDK's default is 2): 1 halves
 * the multiplication, 0 removes it. The trade-off is that those are the same
 * retries that recover a genuine 429 or 5xx, so spending them buys a bounded
 * worst case at the cost of resilience to a rate limit. It is left at the
 * default here on purpose: which way that trade goes is the owner's call to
 * make against preview numbers, not this wrapper's to make on their behalf,
 * and this comment is the record of the decision being open rather than
 * settled.
 */

/**
 * The call signature of fetch, and only that.
 *
 * Not `typeof globalThis.fetch`: under @types/bun that type also carries a
 * `preconnect` helper, and a wrapper (or a test double) that posts one
 * request has no business implementing it. The provider's `fetch` option is
 * declared as the full type, so the one assertion that bridges the two lives
 * at the bottom of this file rather than at every call site.
 */
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

/** Numbers describing one retry, for the log line. */
export interface BoundedFetchRetry {
  /** 1-based attempt that stalled. */
  attempt: number
  /** The deadline that attempt was given, in ms. */
  firstByteTimeoutMs: number
  backoffMs: number
  attemptsLeft: number
}

export interface BoundedFetchOptions {
  /** Deadline for every attempt but the last. */
  firstByteTimeoutMs?: number
  /** Deadline for the last attempt, after which the call simply fails. */
  lastAttemptTimeoutMs?: number
  maxAttempts?: number
  /** Wait before attempt n+1; the last entry repeats if attempts outrun it. */
  backoffMs?: readonly number[]
  /** Injected in tests; the real one is the platform fetch. */
  fetchImpl?: FetchLike
  /** Injected so tests need not spend the backoff in real time. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  onRetry?: (retry: BoundedFetchRetry) => void
  /**
   * Time from an attempt's request to its first body byte, once per attempt
   * that produced one. This is the number the two deadlines above are checked
   * against, so it is measured rather than inferred from a step duration.
   */
  onFirstByte?: (ms: number) => void
  /** Injected so the measured duration is assertable. */
  now?: () => number
}

/**
 * How long an attempt *before the last* may take to send its first response
 * byte.
 *
 * Measured against six eval runs on GitHub runners against the global Vertex
 * endpoint at concurrency 2. The run ids, the per-run counts and the extraction
 * recipe are in the operations runbook, under "What to watch"; so is the
 * warning about treating runner egress as Vercel's.
 *
 * Count attempts, not requests, when asking how often a deadline is met. One
 * request spans up to CHAT_MAX_STEPS model calls and each call up to
 * VERTEX_MAX_ATTEMPTS attempts, and a request that exhausts the wrapper can
 * write both a failure line and an `incomplete` completion line, so
 * request-level counts cannot be added up. Attempts can: every attempt ends in
 * exactly one of three log shapes, and each shape is counted from its own line.
 *
 *   1,136   completed a model call (a `[chat] step` line)
 *      36   abandoned here and retried (a `[vertex] retry` line)
 *      18   exhausted the ceiling below and threw (a TimeoutError message)
 *   -----
 *   1,190   attempts, of which 54 were cut at a deadline: 4.5%
 *
 * Of the 523 requests behind them, 514 recorded a `vertexFirstByteMs`. Over
 * those: p50 5,288 ms, p90 17,013, p95 22,051, p99 26,838, max 35,970. Chat
 * steps run at thinking `medium` and thought tokens are not streamed
 * (`sendReasoning: false`), so the connection is quiet through that phase.
 *
 * Read those percentiles as survivor statistics, which is the one thing about
 * them that matters. `onFirstByte` fires only after a chunk arrives, so a wait
 * that outran its deadline cannot enter the distribution: "30 s is above p99"
 * is true by construction of the instrument and is not evidence that the
 * deadline is rarely met. The 4.5% above is that evidence. Each of the 36 cut
 * here bought a second connection to a generation Vertex may still have been
 * running, and billing for.
 *
 * The distribution is therefore cut twice, once by each deadline, and neither
 * cut shows up in the percentiles it produces. Above 30 s a wait survives only
 * on a last attempt, which is why the three samples that clear it (31,661,
 * 33,958 and 35,970) all belong to requests that retried. Above 37 s nothing
 * survives at all.
 *
 * Moving this number is not free in either direction. The two deadlines sum to
 * a constant the arithmetic below derives, so a second added here is a second
 * taken off the only attempt whose deadline a visitor ever sees.
 *
 * `msSinceStart` on the `[chat] step` line is not this measurement: it is
 * elapsed time to the *end* of a step, generation included.
 *
 * Because a retry stands behind it, a slow-but-healthy step that trips it is
 * retried, not failed, and the last attempt below is given room to simply be
 * slow.
 */
export const VERTEX_FIRST_BYTE_TIMEOUT_MS = 30_000

/** The platform limit every number here is carved out of. */
export const VERCEL_FUNCTION_LIMIT_MS = 300_000

/**
 * The share of the function limit this wrapper may spend *waiting* for first
 * bytes across one request.
 *
 * The remaining 30 s is for everything the wrapper does not bound: the token
 * exchange, the generation time after the first byte (unbounded here by
 * design: a long answer is the model working), and the platform's own
 * overhead.
 */
export const VERTEX_REQUEST_WAIT_BUDGET_MS = 270_000

/**
 * Attempts per model call, this wrapper's own: the SDK adds none on top of
 * the stall path, because the error thrown when these run out is abort-named
 * and its retry loop rethrows those untouched.
 *
 * Two, not three, and the arithmetic under VERTEX_LAST_ATTEMPT_TIMEOUT_MS is
 * why: a third fast attempt would spend 30.5 s of every model call's budget,
 * and that budget is what the last attempt's ceiling is made of. One retry is
 * what buys back a connection that stalled on opening; a second stall in a
 * row is a deployment having a bad minute, and against that a long final
 * attempt is worth more than another 30 s probe.
 */
export const VERTEX_MAX_ATTEMPTS = 2

/**
 * How long the LAST attempt may take to send its first byte. Longer than
 * the probe, and it is the remainder of the per-call budget: at this point
 * there is no retry behind it, so a deadline that fires is the visitor's
 * failed answer. The wrapper's job flips from "cut it short and try again"
 * to "let it finish if it possibly can", and a slow call degrades to slow
 * rather than to failed-and-billed-twice.
 *
 * Arithmetic, down from the function limit:
 *
 *   waiting budget        270_000 ms   (VERTEX_REQUEST_WAIT_BUDGET_MS)
 *   model calls / request       4      (CHAT_MAX_STEPS, lib/chat/validate.ts)
 *   per model call         67_500 ms
 *   spent before the last attempt:
 *     first attempt        30_000 ms   (VERTEX_FIRST_BYTE_TIMEOUT_MS)
 *     backoff                 500 ms
 *   left for the last      37_000 ms
 *
 * 37 s is that, not rounded: fixed by the arithmetic, not chosen from the
 * measurement. The measurement cannot confirm it either, because the sample is
 * censored at exactly this number, an attempt slower than it throwing rather
 * than recording a wait. What the sample does say is that two things are true
 * at once:
 *
 *   waits this long happen. The slowest recorded was 35,970 ms, and the
 *   slowest on a request that went on to answer was 33,958, so a ceiling
 *   under that would have turned an answer into a failure;
 *
 *   18 of the 523 requests, 3.4%, exhausted this ceiling and got nothing,
 *   each reporting the full 67,500 ms across its two attempts.
 *
 * Whether those 18 were connections that were never going to speak or steps
 * that wanted 40 s is not answerable from a failure line carrying only a stage
 * and an error name, and that is the question deciding whether this number is
 * too small rather than merely tight. Until something answers it, widening has
 * no measured case, and nowhere to take the seconds from: out of the probe
 * above, whose own margin is what holds the cut rate at 4.5%, or out of
 * CHAT_MAX_STEPS, or out of the reserve VERTEX_REQUEST_WAIT_BUDGET_MS keeps
 * outside the waiting budget. All three are choices about the shape of a
 * request rather than about this constant.
 *
 * The worst case that arithmetic reaches, every step stalling once, then its
 * last attempt running to the ceiling, is 4 x (30 + 0.5 + 37) = 270 s. Read
 * it for what it is: 270 s of *waiting for first bytes*, containing not one
 * generated token. What the reserve outside the waiting budget has to cover
 * is everything that happens after each first byte: the streaming of up to
 * CHAT_MAX_STEPS answers, the tool execution between the steps, and the token
 * exchange at the front, none of which this wrapper bounds. So 270 s is a
 * ceiling on the wrapper's own waiting, not on the request; a request that
 * spends it and then streams is over the limit, which is the real reason the
 * attempt count is small. bounded-fetch.test.ts pins the waiting figure
 * against the real CHAT_MAX_STEPS, so raising the step count fails a test
 * rather than a production request.
 *
 * A body that cannot be replayed gets one attempt, and that attempt is the
 * last one, so it is given this ceiling too.
 */
export const VERTEX_LAST_ATTEMPT_TIMEOUT_MS = 37_000

/**
 * Backoff between attempts. Short on purpose: the answer's budget is being
 * spent while we wait, and a stalled connection is not a rate limit: there
 * is nothing to back off *from*. Long enough only to let a transient network
 * or load-balancer condition pass rather than re-hitting it instantly. One
 * entry because there is one retry; the last entry repeats if the attempt
 * count is ever raised.
 */
export const VERTEX_RETRY_BACKOFF_MS = [500] as const

/**
 * What one request's model calls did inside this wrapper, so the request can
 * report it rather than hide it.
 */
export interface VertexCallCounter {
  /** Pass as `onRetry`; logs the numbers and counts the retry. */
  observeRetry: (retry: BoundedFetchRetry) => void
  /** Pass as `onFirstByte`. */
  observeFirstByte: (ms: number) => void
  /** Retries recorded so far. */
  retries: () => number
  /**
   * The slowest first byte any call on this request waited for, or 0 if none
   * got one. The max rather than the last: the question this answers is
   * whether any real step came near the deadlines, and an average or a final
   * value would bury exactly that step.
   */
  firstByteMs: () => number
}

/**
 * A per-request counter.
 *
 * A retry is invisible to the visitor and, without this, invisible in the
 * logs of the request that paid for it: a `modelMs` or a `[chat] ms` that
 * quietly contains a second billed generation is a measurement no one can
 * read correctly. The first-byte time is the other half: the number both
 * deadlines in this file are checked against, which nothing measures
 * unless it is counted here. One counter per request, wired into the model
 * client that request uses, is what makes either reportable.
 */
export function createVertexCallCounter(): VertexCallCounter {
  let retries = 0
  let slowestFirstByteMs = 0
  return {
    observeRetry: retry => {
      retries += 1
      logRetry(retry)
    },
    observeFirstByte: ms => {
      slowestFirstByteMs = Math.max(slowestFirstByteMs, ms)
    },
    retries: () => retries,
    firstByteMs: () => slowestFirstByteMs,
  }
}

/**
 * Wrap fetch so a call that sends no first byte in time is abandoned and
 * retried. Returns a drop-in `fetch`, which is what the Vertex provider's
 * `fetch` option takes (FetchFunction = typeof globalThis.fetch).
 */
export function createBoundedFetch({
  firstByteTimeoutMs = VERTEX_FIRST_BYTE_TIMEOUT_MS,
  lastAttemptTimeoutMs = VERTEX_LAST_ATTEMPT_TIMEOUT_MS,
  maxAttempts = VERTEX_MAX_ATTEMPTS,
  backoffMs = VERTEX_RETRY_BACKOFF_MS,
  fetchImpl = globalThis.fetch,
  sleep = delay,
  onRetry = logRetry,
  onFirstByte = () => {},
  now = Date.now,
}: BoundedFetchOptions = {}): typeof globalThis.fetch {
  const boundedFetch: FetchLike = async (input, init) => {
    const callerSignal = init?.signal ?? undefined
    const callStarted = now()
    // A body that can only be read once cannot be sent twice. The SDK sends
    // JSON strings here, so this is a guard against a future caller rather
    // than a case seen today, but a silently half-sent retry would be worse
    // than no retry at all.
    const attempts = isReplayable(init?.body) ? maxAttempts : 1

    for (let attempt = 1; ; attempt++) {
      callerSignal?.throwIfAborted()
      const timeoutMs =
        attempt >= attempts ? lastAttemptTimeoutMs : firstByteTimeoutMs
      const stall = new AbortController()
      const timer = setTimeout(() => stall.abort(), timeoutMs)
      // The stall signal is merged with the caller's rather than replacing
      // it, so a visitor who closes the tab still cancels the upstream call
      // immediately, including during the streamed body, which is why the
      // merged signal (not the timer) is what the response holds on to.
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, stall.signal])
        : stall.signal
      const attemptStarted = now()
      try {
        const response = await fetchUnderSignal(
          fetchImpl,
          input,
          { ...init, signal },
          signal
        )
        // Still inside the timer, on purpose: headers are not the first byte
        // on a streaming response. Only the chunk clears the deadline, and
        // the `finally` below is what clears it, so the wait for it is
        // bounded by the same abort the connection is.
        const bound = await bindFirstChunk(response, signal)
        // Measured here rather than around the whole call: what the deadlines
        // above bound is one attempt's wait, so that is what has to be
        // comparable to them.
        onFirstByte(now() - attemptStarted)
        return bound
      } catch (error) {
        // Caller first: when both fire, a disconnect outranks a stall. The
        // visitor is gone, so there is nothing left to retry for.
        if (callerSignal?.aborted) throw error
        // Not our timeout: a refused connection, a 5xx handler's throw, a DNS
        // failure. Those the SDK already classifies and retries on its own
        // terms, and duplicating that here would multiply the attempts.
        if (!stall.signal.aborted) throw error
        if (attempt >= attempts) {
          throw firstByteTimeout(attempt, now() - callStarted)
        }

        const backoff = backoffMs[attempt - 1] ?? backoffMs.at(-1) ?? 0
        onRetry({
          attempt,
          firstByteTimeoutMs: timeoutMs,
          backoffMs: backoff,
          attemptsLeft: attempts - attempt,
        })
        await sleep(backoff, callerSignal)
      } finally {
        // Cleared on the success path too: past the first byte the timer must
        // never fire, or it would abort a stream mid-answer.
        clearTimeout(timer)
      }
    }
  }
  // Widened to the provider's FetchFunction, which is `typeof
  // globalThis.fetch`. The SDK only ever calls it as a function, see
  // postToApi in @ai-sdk/provider-utils, so the extra members of that type
  // are never reached.
  return boundedFetch as typeof globalThis.fetch
}

/**
 * One `fetch`, losing the race to the deadline or a disconnect.
 *
 * The signal still reaches the transport, so a cooperative one tears its own
 * connection down. This race is what holds the deadline when it is not.
 * Waiting on the transport's promise alone gives the attempt no ceiling at
 * all: a connection stuck in DNS, in connect or in the TLS handshake may never
 * reject, and every number in this file is then a number the wrapper reports
 * rather than enforces. `firstByteTimeout` measures its elapsed against the
 * wall clock, so an attempt that outlives its abort still reports the time it
 * really took, and the message can name an elapsed many times the sum of the
 * ceilings that produced it.
 *
 * What this bounds is our own waiting, and only that. For the case it exists
 * for there is no response yet and so no body to release: the socket, and any
 * generation behind it, stay with the transport until it gives up. One request
 * can hold several such connections. Bounding the wait is what keeps a step
 * from spending the whole function on one of them; it does not reclaim
 * anything.
 *
 * The body phase downstream races the same signal for the same reason. Both
 * halves of the wait need it, because the deadline has to end the wait
 * whatever the transport does with the signal.
 */
function fetchUnderSignal(
  fetchImpl: FetchLike,
  input: RequestInfo | URL,
  init: RequestInit,
  signal: AbortSignal
): Promise<Response> {
  let onAbort: (() => void) | undefined
  return new Promise<Response>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    fetchImpl(input, init).then(response => {
      // A response that arrives after the race is lost is abandoned, and
      // `resolve` is already a no-op. Cancelling its body is not: an unread
      // stream holds the connection open for the rest of the function's life,
      // which is the cost this wrapper exists to stop paying.
      if (signal.aborted) void response.body?.cancel().catch(() => {})
      resolve(response)
    }, reject)
  }).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  })
}

/**
 * Hold the response back until its first body chunk arrives, then hand over a
 * response that replays that chunk and streams the rest untouched.
 *
 * Reading the chunk here rather than in a TransformStream downstream is what
 * keeps a stalled body *retryable*: the SDK's retry loop is long finished by
 * the time it consumes the stream, so an error raised there would end the
 * request. Raising it before this function returns keeps it inside the
 * attempt loop above, where nothing has reached the visitor yet.
 *
 * A response with no body (204, 304, a HEAD) is returned as it came: there is
 * no first byte to wait for.
 *
 * Nor is a non-2xx one held back. The SDK reads `response.ok` only after it
 * has the response (postToApi in @ai-sdk/provider-utils), so a 429 or a 503
 * whose error body is slow to arrive would otherwise be abandoned and
 * *retried here as a stall*, hiding a rate limit the SDK is equipped to
 * classify and back off from, and spending a second connection to do it. The
 * cost of passing it straight through is that the wait for that error body is
 * unbounded by this wrapper, which is the right trade: an error body is bytes
 * the server has already decided to send, not a generation that never started.
 */
async function bindFirstChunk(
  response: Response,
  signal: AbortSignal
): Promise<Response> {
  if (!response.ok) return response
  if (!response.body) return response
  const reader = response.body.getReader()
  const first = await readFirstChunk(reader, signal)
  // Status, statusText and headers are copied from the original; only the
  // body is new, and it carries the same bytes in the same order.
  return new Response(replay(reader, first), response)
}

/**
 * What one `read()` resolves to, spelled from the reader itself: lib.dom and
 * @types/bun disagree on the name of this type, and only one of them is in
 * scope here.
 */
type ChunkRead = Awaited<
  ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>
>

/**
 * The first read that carries bytes, ended by the attempt's deadline or a
 * visitor disconnect.
 *
 * Reads until a non-empty chunk or the end of the body, under the one
 * deadline: a zero-length chunk is not a first byte. A transport that opens
 * a stream with an empty frame, a keep-alive or a flushed-but-empty write,
 * would otherwise clear the deadline while the connection has still said
 * nothing, which is precisely the stall this file exists to catch.
 */
async function readFirstChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ChunkRead> {
  try {
    for (;;) {
      const read = await readUnderSignal(reader, signal)
      if (read.done || (read.value?.byteLength ?? 0) > 0) return read
    }
  } catch (error) {
    // Let the connection go. Not awaited: the socket is being abandoned, and
    // a rejection here would mask the reason this is throwing.
    void reader.cancel(error).catch(() => {})
    throw error
  }
}

/** One `read()`, losing the race to the deadline or a disconnect. */
function readUnderSignal(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ChunkRead> {
  // The race is explicit rather than left to the fetch implementation
  // rejecting its own body on abort: the deadline has to end this wait
  // whatever the transport does with the signal.
  let onAbort: (() => void) | undefined
  return new Promise<ChunkRead>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    reader.read().then(resolve, reject)
  }).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  })
}

/** The already-read first chunk, then the rest of the body, byte for byte. */
function replay(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  first: ChunkRead
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      // An empty body is a finished call, not a stall: pass the end along.
      if (first.done) controller.close()
      else controller.enqueue(first.value)
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

/**
 * Named for the abort family on purpose. `isAbortError` in the SDK matches
 * 'TimeoutError', and its retry loop rethrows those without a further
 * attempt, which is what we want, having already made our own. It does not
 * masquerade as a visitor disconnect either: `streamText` decides that from
 * the caller's signal being aborted, not from the error's name.
 */
function firstByteTimeout(attempts: number, elapsedMs: number): Error {
  // Total elapsed, not the last attempt's deadline: the attempts before it
  // and the backoff between them are time this request spent too, and a
  // message naming only the final ceiling reads as a much shorter wait than
  // the one that actually happened.
  const error = new Error(
    `Vertex sent no response byte in ${elapsedMs} ms across ${attempts} attempt(s)`
  )
  error.name = 'TimeoutError'
  return error
}

/** Bodies that can be sent again as-is. A stream can be read only once. */
function isReplayable(body: BodyInit | null | undefined): boolean {
  return (
    body == null ||
    typeof body === 'string' ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob
  )
}

/** Sleep that a visitor disconnect cuts short rather than waiting out. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * One numeric line per retry, in the chat handler's aggregate-only style: a
 * retry line is written on the same request that carries a visitor's
 * question, so it records counts and durations and nothing that could echo
 * the prompt: not the URL, not the body, not the error message.
 */
function logRetry(retry: BoundedFetchRetry): void {
  console.warn('[vertex] retry', retry)
}
