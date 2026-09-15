const PENDING_QUESTION_KEY = 'matt-career-assistant:pending-question'

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

export function handOffQuestion(question: string): void {
  try {
    sessionStorage.setItem(PENDING_QUESTION_KEY, question)
  } catch {
    // Storage disabled or full. /ask opens empty and the visitor retypes.
  }
}

/** Read the pending question and clear it. Returns null when there is none. */
export function takePendingQuestion(): string | null {
  try {
    const question = sessionStorage.getItem(PENDING_QUESTION_KEY)
    if (question !== null) sessionStorage.removeItem(PENDING_QUESTION_KEY)
    return question
  } catch {
    return null
  }
}
