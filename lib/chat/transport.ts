import type { ChatErrorBody } from './validate'

/**
 * The browser's side of the chat route's refusals (MTC-34).
 *
 * Like answer.ts, this module is imported by the client bundle, so it has no
 * runtime imports; the one import above is a type.
 *
 * The route answers every refusal with the `{ error: { code, message } }`
 * envelope, and the UI renders the code. One refusal never comes from the
 * route: the Vercel WAF rate limit answers a 429 at the edge with its own
 * body, before the function runs. The AI SDK's transport keeps only a
 * response's text, not its status, so without help that 429 would render as
 * the generic "something went wrong" instead of the rate-limit notice with
 * the résumé and project links. This wrapper gives the edge's 429 the
 * envelope the UI already understands.
 */

/** `message` is a placeholder: the UI renders its own rate-limit copy. */
export const RATE_LIMITED_ENVELOPE: ChatErrorBody = {
  error: { code: 'rate_limited', message: 'Rate limited.' },
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

type Fetch = typeof globalThis.fetch

/**
 * A fetch that rewrites a 429 whose body is not already the route's envelope
 * into one that is. Everything else passes through untouched, including a
 * 429 the route itself sends once MTC-34's in-app limiter exists.
 *
 * Returned as the platform's `fetch` type because that is what the AI SDK's
 * transport accepts. Node's version of that type carries a `preconnect`
 * hint; it is forwarded when the wrapped fetch has one and is a no-op
 * otherwise, since nothing here preconnects.
 */
export function withRateLimitEnvelope(fetchImpl: FetchLike): Fetch {
  const wrapped = (async (input, init) => {
    const response = await fetchImpl(input, init)
    if (response.status !== 429) return response

    const text = await response.text()
    if (isEnvelope(text)) {
      return new Response(text, {
        status: response.status,
        headers: response.headers,
      })
    }
    return new Response(JSON.stringify(RATE_LIMITED_ENVELOPE), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })
  }) as Fetch
  wrapped.preconnect =
    'preconnect' in fetchImpl
      ? (fetchImpl as Fetch).preconnect
      : () => undefined
  return wrapped
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
