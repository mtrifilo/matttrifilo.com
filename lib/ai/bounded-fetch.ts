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
 * What it bounds is time to *response headers*, not the whole call. Once
 * bytes are flowing the model is working and a long answer is legitimate; a
 * stall is the connection that never says anything at all. That split is also
 * what makes retrying safe: before headers nothing has reached the visitor,
 * so a second connection is invisible to them. After headers, the answer is
 * already streaming into their browser and a retry would replay a partial
 * answer on top of itself — so the wrapper never retries past that point.
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
  headersTimeoutMs: number
  backoffMs: number
  attemptsLeft: number
}

export interface BoundedFetchOptions {
  headersTimeoutMs?: number
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
 * How long a model call may take to send its first response byte.
 *
 * Bounded from both sides by measurement, not by taste. Healthy calls on this
 * deployment took 1 to 14 s end to end — and end to end is the *ceiling* on
 * time-to-first-byte, since streaming calls start emitting well before they
 * finish — so 20 s is at least 1.4x the slowest healthy call in the episode's
 * log and far more than that against real first-byte times. Stalls took 80 to
 * 110 s, so 20 s sits at a quarter of the fastest one: no stall can hide under
 * it, and no healthy call that has been observed is anywhere near it.
 */
export const VERTEX_HEADERS_TIMEOUT_MS = 20_000

/**
 * Attempts per model call, this wrapper's own — the SDK adds none on top,
 * because the error thrown when these run out is abort-named and its retry
 * loop rethrows those untouched.
 *
 * Three is what the 300 s function limit affords. Worst case for one model
 * call is 20 + 0.5 + 20 + 1.5 + 20 ≈ 62 s, and the chat route takes up to
 * CHAT_MAX_STEPS = 4 model calls in one request, so a request where *every*
 * step stalls every time still ends near 248 s — inside the limit, with the
 * failure logged, instead of the 290 s silence the episode produced. The
 * ordinary case costs far less: one stalled step recovers in 20.5 s.
 */
export const VERTEX_MAX_ATTEMPTS = 3

/**
 * Backoff between attempts. Short on purpose: the answer's budget is being
 * spent while we wait, and a stalled connection is not a rate limit — there
 * is nothing to back off *from*. Long enough only to let a transient network
 * or load-balancer condition pass rather than re-hitting it instantly.
 */
export const VERTEX_RETRY_BACKOFF_MS = [500, 1_500] as const

/**
 * Wrap fetch so a call that sends no response headers in time is abandoned
 * and retried. Returns a drop-in `fetch`, which is what the Vertex provider's
 * `fetch` option takes (FetchFunction = typeof globalThis.fetch).
 */
export function createBoundedFetch({
  headersTimeoutMs = VERTEX_HEADERS_TIMEOUT_MS,
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
      const stall = new AbortController()
      const timer = setTimeout(() => stall.abort(), headersTimeoutMs)
      try {
        // The stall signal is merged with the caller's rather than replacing
        // it, so a visitor who closes the tab still cancels the upstream call
        // immediately — including during the streamed body, which is why the
        // merged signal (not the timer) is what the response holds on to.
        return await fetchImpl(input, {
          ...init,
          signal: callerSignal
            ? AbortSignal.any([callerSignal, stall.signal])
            : stall.signal,
        })
      } catch (error) {
        // Caller first: when both fire, a disconnect outranks a stall. The
        // visitor is gone, so there is nothing left to retry for.
        if (callerSignal?.aborted) throw error
        // Not our timeout: a refused connection, a 5xx handler's throw, a DNS
        // failure. Those the SDK already classifies and retries on its own
        // terms, and duplicating that here would multiply the attempts.
        if (!stall.signal.aborted) throw error
        if (attempt >= attempts) throw headersTimeout(attempt, headersTimeoutMs)

        const backoff = backoffMs[attempt - 1] ?? backoffMs.at(-1) ?? 0
        onRetry({
          attempt,
          headersTimeoutMs,
          backoffMs: backoff,
          attemptsLeft: attempts - attempt,
        })
        await sleep(backoff, callerSignal)
      } finally {
        // Cleared on the success path too: past response headers the timer
        // must never fire, or it would abort a stream mid-answer.
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
 * Named for the abort family on purpose. `isAbortError` in the SDK matches
 * 'TimeoutError', and its retry loop rethrows those without a further
 * attempt — which is what we want, having already made our own. It does not
 * masquerade as a visitor disconnect either: `streamText` decides that from
 * the caller's signal being aborted, not from the error's name.
 */
function headersTimeout(attempts: number, headersTimeoutMs: number): Error {
  const error = new Error(
    `Vertex sent no response headers within ${headersTimeoutMs} ms on ${attempts} attempt(s)`
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
