/**
 * How long the route waits for the visitor classifier (MTC-34).
 *
 * `checkBotId` is an HTTPS call to Vercel's classifier with no timeout of
 * its own, and the chat route has already lived through a forty-minute
 * episode of calls that stalled for 80 to 110 s (MTC-38). A healthy
 * classification is a fraction of a second; three seconds is long enough
 * for a slow one and short enough that a stalled classifier fails the
 * request instead of holding a function open toward Vercel's limit.
 */
export const VISITOR_CHECK_TIMEOUT_MS = 3_000

/**
 * Resolve to the verdict, or reject once the timeout passes. The classifier
 * call keeps running in the background; nothing here can cancel it, and the
 * route has already answered by then.
 */
export function boundVerdict<T>(
  verdict: Promise<T>,
  timeoutMs = VISITOR_CHECK_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`visitor check exceeded ${timeoutMs} ms`)
      error.name = 'VisitorCheckTimeout'
      reject(error)
    }, timeoutMs)
  })
  return Promise.race([verdict, timeout]).finally(() => clearTimeout(timer))
}
