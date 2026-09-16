import { CHAT_UNKNOWN_ERROR_MESSAGE } from './answer'
import type { ChatErrorBody } from './validate'

/**
 * The browser's side of the chat route's refusals (MTC-34).
 *
 * Like answer.ts, this module is imported by the client bundle, so its only
 * runtime import is answer.ts, which has none.
 *
 * The route answers every refusal with the `{ error: { code, message } }`
 * envelope, and the UI renders the code. Two failures never come from the
 * route, and this wrapper gives both the envelope the UI already
 * understands:
 *
 * - The Vercel WAF rate limit answers a 429 at the edge with its own body,
 *   before the function runs. The AI SDK's transport keeps only a
 *   response's text, not its status, so without help that 429 would render
 *   as the generic "something went wrong" instead of the rate-limit notice.
 * - BotID patches `window.fetch` to run its challenge before a protected
 *   request. If the challenge script fails to load, a second attempt in the
 *   same tab can wait on it forever, and `useChat` would spin with no
 *   request ever sent. That wait happens before the real fetch starts, so
 *   an abort signal cannot end it: the patched fetch does not look at the
 *   signal until it hands the request on. The bound below therefore races
 *   the promise itself, and only aborts the controller as a courtesy for
 *   a request that did start.
 */

/** `message` is a placeholder: the UI renders its own rate-limit copy. */
export const RATE_LIMITED_ENVELOPE: ChatErrorBody = {
  error: { code: 'rate_limited', message: 'Rate limited.' },
}

/** What a request that never produced headers is reported as. */
export const UNAVAILABLE_ENVELOPE: ChatErrorBody = {
  error: { code: 'unavailable', message: CHAT_UNKNOWN_ERROR_MESSAGE },
}

/**
 * The route returns its response as soon as the model call is started, so
 * headers normally arrive within a few seconds even when the answer takes
 * thirty. Twenty seconds leaves room for a slow classifier and a slow cold
 * start and still ends a hung challenge before a visitor gives up.
 */
export const CHAT_HEADERS_TIMEOUT_MS = 20_000

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

type Fetch = typeof globalThis.fetch

const HEADERS_TIMEOUT = Symbol('chat headers timeout')

export interface ChatFetchOptions {
  headersTimeoutMs?: number
}

/**
 * The fetch the chat transport uses. Everything but the two cases above
 * passes through untouched, the original `Response` object included, so
 * streaming is unaffected; the caller's abort signal is honoured throughout.
 *
 * Returned as the platform's `fetch` type because that is what the AI SDK's
 * transport accepts. Node's version of that type carries a `preconnect`
 * hint; nothing here preconnects, so it is a no-op.
 */
export function createChatFetch(
  fetchImpl: FetchLike,
  { headersTimeoutMs = CHAT_HEADERS_TIMEOUT_MS }: ChatFetchOptions = {}
): Fetch {
  const wrapped = (async (input, init) => {
    const callerSignal = init?.signal ?? undefined
    const controller = new AbortController()
    if (callerSignal?.aborted) controller.abort(callerSignal.reason)
    else
      callerSignal?.addEventListener(
        'abort',
        () => controller.abort(callerSignal.reason),
        { once: true }
      )
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<typeof HEADERS_TIMEOUT>(resolve => {
      timer = setTimeout(() => resolve(HEADERS_TIMEOUT), headersTimeoutMs)
    })

    let response: Response
    try {
      const outcome = await Promise.race([
        fetchImpl(input, { ...init, signal: controller.signal }),
        timedOut,
      ])
      if (outcome === HEADERS_TIMEOUT) {
        // Cancel the request if it ever started; then answer for it. A
        // caller abort that raced in first keeps its own meaning below.
        if (callerSignal?.aborted) throw callerSignal.reason
        controller.abort(HEADERS_TIMEOUT)
        return envelope(UNAVAILABLE_ENVELOPE, 502)
      }
      response = outcome
    } finally {
      // Headers are in, or the wait is over either way.
      clearTimeout(timer)
    }

    if (response.status !== 429) return response

    const text = await response.text()
    if (isEnvelope(text)) {
      return new Response(text, {
        status: response.status,
        headers: response.headers,
      })
    }
    return envelope(RATE_LIMITED_ENVELOPE, 429)
  }) as Fetch
  wrapped.preconnect = () => undefined
  return wrapped
}

function envelope(body: ChatErrorBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isEnvelope(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { error?: { code?: unknown } }).error?.code === 'string'
    )
  } catch {
    return false
  }
}
