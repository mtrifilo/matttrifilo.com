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

/** A question on its way from the homepage to /ask. */
export interface PendingQuestion {
  question: string
  /**
   * True when it was a starter question picked by touch, which /ask answers
   * by leaving the composer unfocused so the on-screen keyboard stays down.
   * False for a typed question and for any other pick.
   */
  pickedByTouch: boolean
}

export function handOffQuestion(
  { question, pickedByTouch }: PendingQuestion,
  now = Date.now()
): void {
  try {
    sessionStorage.setItem(
      PENDING_QUESTION_KEY,
      JSON.stringify({ question, pickedByTouch, at: now })
    )
  } catch {
    // Storage disabled or full. /ask opens empty and the visitor retypes.
  }
}

/**
 * Read the pending question and clear it. Returns null when there is none,
 * or when the one there is has gone stale.
 */
export function takePendingQuestion(now = Date.now()): PendingQuestion | null {
  try {
    const raw = sessionStorage.getItem(PENDING_QUESTION_KEY)
    if (raw === null) return null
    sessionStorage.removeItem(PENDING_QUESTION_KEY)
    return askableQuestion(raw, now)
  } catch {
    return null
  }
}

/**
 * Whether /ask is about to ask a handed-off question, without taking it. The
 * page reads this while rendering, so it lays out a conversation from its
 * first frame rather than an empty state it would drop a moment later.
 */
export function hasPendingQuestion(now = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(PENDING_QUESTION_KEY)
    return raw !== null && askableQuestion(raw, now) !== null
  } catch {
    return false
  }
}

/**
 * The stored question, or null when it is malformed or has gone stale. Only
 * an explicit `true` counts as a touch pick: anything else there is read as
 * a question asked some other way.
 */
function askableQuestion(raw: string, now: number): PendingQuestion | null {
  const pending = JSON.parse(raw) as {
    question?: unknown
    pickedByTouch?: unknown
    at?: unknown
  }
  if (typeof pending.question !== 'string' || typeof pending.at !== 'number')
    return null
  if (now - pending.at > PENDING_QUESTION_TTL_MS) return null
  return {
    question: pending.question,
    pickedByTouch: pending.pickedByTouch === true,
  }
}
