/**
 * A fetch wrapper that bounds and retries a stalled Vertex call (MTC-38).
 *
 * The episode this exists for: on one preview, every model call took 80 to
 * 110 s regardless of size — a 1,700-token call that produced 16 tokens took
 * as long as a real answer — while the same call from a laptop through the
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
 * the rest of the function's life — which is the shape of the stall this
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
 * both — visitor visibility is not idempotency. That is the price of the
 * bound, it is why the attempt count is small, and it is why every retry is
 * counted into the request's own log line (`vertexRetries` on `[chat]`,
 * `retries` on the health route) rather than hidden.
 *
 * One bound this cannot enforce: the SDK's own `retryWithExponentialBackoff`
 * (maxRetries = 2 by default) wraps this wrapper. Our stall error is
 * abort-named, so that loop rethrows it untouched and never multiplies the
 * stall path — but a *retryable API error* (a 429, a 5xx) is retried up to
 * twice above us, and each of those attempts gets this wrapper's full
 * per-call budget again. A call that both stalls and then fails with a
 * retryable error can therefore cost up to three times the per-call
 * arithmetic below. Bounding that would take a deadline shared across the
 * whole request rather than a per-call one; it is not built, and this comment
 * is the record of that.
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
}

/**
 * How long an attempt *before the last* may take to send its first response
 * byte.
 *
 * This number is a hypothesis, and it is worth saying which one. It was drawn
 * from the health route's one-word, non-streaming calls: healthy ones took 1
 * to 14 s end to end on this deployment while stalls took 80 to 110 s, so
 * 20 s sits above every healthy call measured there and at a quarter of the
 * fastest stall. Nothing has yet measured the thing it is applied to — a chat
 * step carrying up to CHAT_MAX_INPUT_TOKENS of prompt plus a thinking phase
 * that emits no bytes while it runs, which can plausibly be quiet for longer
 * than a one-word call ever is. The `[chat] step` line logs `msSinceStart`
 * per step on preview; that is the per-step time-to-first-byte measurement
 * which should replace this guess, and until it does the number is not
 * evidence.
 *
 * Because it is a guess, it bounds only the attempts that have a retry behind
 * them. A slow-but-healthy step that trips it is retried, not failed, and the
 * last attempt below is given room to simply be slow.
 */
export const VERTEX_FIRST_BYTE_TIMEOUT_MS = 20_000

/** The platform limit every number here is carved out of. */
export const VERCEL_FUNCTION_LIMIT_MS = 300_000

/**
 * The share of the function limit this wrapper may spend *waiting* for first
 * bytes across one request.
 *
 * The remaining 30 s is for everything the wrapper does not bound: the token
 * exchange, the generation time after the first byte (unbounded here by
 * design — a long answer is the model working), and the platform's own
 * overhead.
 */
export const VERTEX_REQUEST_WAIT_BUDGET_MS = 270_000

/**
 * Attempts per model call, this wrapper's own — the SDK adds none on top of
 * the stall path, because the error thrown when these run out is abort-named
 * and its retry loop rethrows those untouched.
 *
 * Two, not three, and the arithmetic under VERTEX_LAST_ATTEMPT_TIMEOUT_MS is
 * why: a third fast attempt would spend 20.5 s of every model call's budget,
 * and that budget is what the last attempt's ceiling is made of. One retry is
 * what buys back a connection that stalled on opening; a second stall in a
 * row is a deployment having a bad minute, and against that a long final
 * attempt is worth more than another 20 s probe.
 */
export const VERTEX_MAX_ATTEMPTS = 2

/**
 * How long the LAST attempt may take to send its first byte. Much larger,
 * deliberately: at this point there is no retry behind it, so a deadline that
 * fires is the visitor's failed answer. The wrapper's job flips from "cut it
 * short and try again" to "let it finish if it possibly can", and a slow call
 * degrades to slow rather than to failed-and-billed-twice.
 *
 * Arithmetic, down from the function limit:
 *
 *   waiting budget        270_000 ms   (VERTEX_REQUEST_WAIT_BUDGET_MS)
 *   model calls / request       4      (CHAT_MAX_STEPS, lib/chat/validate.ts)
 *   per model call         67_500 ms
 *   spent before the last attempt:
 *     first attempt        20_000 ms   (VERTEX_FIRST_BYTE_TIMEOUT_MS)
 *     backoff                 500 ms
 *   left for the last      47_000 ms
 *
 * 45 s is that, rounded down for margin. The worst case a chat request can
 * then reach — every step stalling once, then its last attempt running to the
 * ceiling — is 4 x (20 + 0.5 + 45) = 262 s: inside the limit, with the
 * failure logged, which is what replaces the episode's 290 s of silence.
 * bounded-fetch.test.ts pins that against the real CHAT_MAX_STEPS, so raising
 * the step count fails a test rather than a production request.
 *
 * A body that cannot be replayed gets one attempt, and that attempt is the
 * last one, so it is given this ceiling too.
 */
export const VERTEX_LAST_ATTEMPT_TIMEOUT_MS = 45_000

/**
 * Backoff between attempts. Short on purpose: the answer's budget is being
 * spent while we wait, and a stalled connection is not a rate limit — there
 * is nothing to back off *from*. Long enough only to let a transient network
 * or load-balancer condition pass rather than re-hitting it instantly. One
 * entry because there is one retry; the last entry repeats if the attempt
 * count is ever raised.
 */
export const VERTEX_RETRY_BACKOFF_MS = [500] as const

/** Counts the retries this wrapper hides, so a request can report its own. */
export interface RetryCounter {
  /** Pass as `onRetry`; logs the numbers and counts the retry. */
  observe: (retry: BoundedFetchRetry) => void
  /** Retries recorded so far. */
  count: () => number
}

/**
 * A per-request retry counter.
 *
 * A retry is invisible to the visitor and, without this, invisible in the
 * logs of the request that paid for it: a `modelMs` or a `[chat] ms` that
 * quietly contains a second billed generation is a measurement no one can
 * read correctly. One counter per request, wired into the model client that
 * request uses, is what makes the number reportable.
 */
export function createRetryCounter(): RetryCounter {
  let retries = 0
  return {
    observe: retry => {
      retries += 1
      logRetry(retry)
    },
    count: () => retries,
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
}: BoundedFetchOptions = {}): typeof globalThis.fetch {
  const boundedFetch: FetchLike = async (input, init) => {
    const callerSignal = init?.signal ?? undefined
    // A body that can only be read once cannot be sent twice. The SDK sends
    // JSON strings here, so this is a guard against a future caller rather
    // than a case seen today — but a silently half-sent retry would be worse
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
      // immediately — including during the streamed body, which is why the
      // merged signal (not the timer) is what the response holds on to.
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, stall.signal])
        : stall.signal
      try {
        const response = await fetchImpl(input, { ...init, signal })
        // Still inside the timer, on purpose: headers are not the first byte
        // on a streaming response. Only the chunk clears the deadline, and
        // the `finally` below is what clears it, so the wait for it is
        // bounded by the same abort the connection is.
        return await bindFirstChunk(response, signal)
      } catch (error) {
        // Caller first: when both fire, a disconnect outranks a stall. The
        // visitor is gone, so there is nothing left to retry for.
        if (callerSignal?.aborted) throw error
        // Not our timeout: a refused connection, a 5xx handler's throw, a DNS
        // failure. Those the SDK already classifies and retries on its own
        // terms, and duplicating that here would multiply the attempts.
        if (!stall.signal.aborted) throw error
        if (attempt >= attempts) throw firstByteTimeout(attempt, timeoutMs)

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
  // globalThis.fetch`. The SDK only ever calls it as a function — see
  // postToApi in @ai-sdk/provider-utils — so the extra members of that type
  // are never reached.
  return boundedFetch as typeof globalThis.fetch
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
 */
async function bindFirstChunk(
  response: Response,
  signal: AbortSignal
): Promise<Response> {
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

/** The first read, ended by the attempt's deadline or a visitor disconnect. */
async function readFirstChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ChunkRead> {
  // The race is explicit rather than left to the fetch implementation
  // rejecting its own body on abort: the deadline has to end this wait
  // whatever the transport does with the signal.
  let onAbort: (() => void) | undefined
  try {
    return await new Promise<ChunkRead>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason)
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      reader.read().then(resolve, reject)
    })
  } catch (error) {
    // Let the connection go. Not awaited: the socket is being abandoned, and
    // a rejection here would mask the reason this is throwing.
    void reader.cancel(error).catch(() => {})
    throw error
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
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
 * attempt — which is what we want, having already made our own. It does not
 * masquerade as a visitor disconnect either: `streamText` decides that from
 * the caller's signal being aborted, not from the error's name.
 */
function firstByteTimeout(attempts: number, timeoutMs: number): Error {
  const error = new Error(
    `Vertex sent no response byte within ${timeoutMs} ms on ${attempts} attempt(s)`
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
 * the prompt — not the URL, not the body, not the error message.
 */
function logRetry(retry: BoundedFetchRetry): void {
  console.warn('[vertex] retry', retry)
}
