const PENDING_QUESTION_KEY = 'matt-career-assistant:pending-question'

/**
 * How long a handed-off question stays askable. The hand-off is one
 * navigation, well under a second; anything older is a question the visitor
 * walked away from (Back mid-navigation, a tab left open), and asking it on
 * their next visit to /ask would bill a model call for something they never
 * chose to send.
 */
const PENDING_QUESTION_TTL_MS = 60_000

/**
 * The homepage panel's handoff to /ask (MTC-33).
 *
 * The question travels in sessionStorage rather than as a `?q=` search param.
 * The site runs Vercel Analytics, which records the URL of every page view, so
 * a question in the query string would be written to an analytics store — the
 * one thing the chat route promises never to happen to a visitor's words. It
 * would also land in the browser's history and in the `Referer` of anything
 * the answer links to.
 *
 * sessionStorage keeps it in the tab, and `take` removes it on the way out, so
 * a reload of /ask is an empty page rather than the same question asked twice.
 * Every access is guarded: a browser with storage blocked throws on the mere
 * act of reading, and the cost of that is retyping a sentence, not a crash.
 */

export function handOffQuestion(question: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(
      PENDING_QUESTION_KEY,
      JSON.stringify({ question, at: now })
    )
  } catch {
    // Storage disabled or full. /ask opens empty and the visitor retypes.
  }
}

/**
 * Read the pending question and clear it. Returns null when there is none,
 * or when the one there is has gone stale.
 */
export function takePendingQuestion(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_QUESTION_KEY)
    if (raw === null) return null
    sessionStorage.removeItem(PENDING_QUESTION_KEY)
    const pending = JSON.parse(raw) as { question?: unknown; at?: unknown }
    if (typeof pending.question !== 'string' || typeof pending.at !== 'number')
      return null
    if (now - pending.at > PENDING_QUESTION_TTL_MS) return null
    return pending.question
  } catch {
    return null
  }
}
