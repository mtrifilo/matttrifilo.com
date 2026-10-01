import { track } from '@vercel/analytics'

/**
 * The assistant's four Vercel Analytics custom events (Matt, 2026-09-30 and
 * 2026-10-01, MTC-35): how often it is opened, asked, declines, and turns a
 * visitor away at the rate limit. Counts only.
 *
 * Every event carries `surface`, and the asked event also carries `source`.
 * Nothing else can reach `track` from here: each function below builds its
 * properties itself from the two closed unions, and none of them takes a
 * string a visitor wrote. That is what keeps the disclosure's
 * "Conversations aren't saved" true with analytics on: the question, the
 * answer and anything else typed never leave the page through this module.
 *
 * Where `<Analytics />` is not rendered (app/layout.tsx renders it only where
 * VERCEL is set, so not locally and not in CI), `window.va` is never defined
 * and `track` returns without doing anything.
 *
 * The event names and property values are Matt's to change, like copy. Vercel
 * Pro allows two properties per custom event, which the asked event uses.
 */

/**
 * Where the visitor is using the assistant: the homepage panel or /ask. For
 * a declined answer or the rate limit, it is where the question that drew it
 * was asked, so a question asked on the homepage and answered on /ask counts
 * as the homepage's, and so does a regenerate of its answer.
 */
export type AssistantSurface = 'home' | 'ask'

/**
 * How a question was asked: a starter pill in the rows, typed into the
 * composer, a follow-up under an answer, or a question from the "See all
 * questions" list.
 */
export type QuestionSource = 'pill' | 'typed' | 'follow-up' | 'list'

/** Where a starter question can be picked from. */
export type StarterSource = Extract<QuestionSource, 'pill' | 'list'>

export const ASSISTANT_EVENTS = {
  opened: 'Assistant opened',
  asked: 'Question asked',
  declined: 'Answer declined',
  rateLimited: 'Rate limit hit',
} as const

type AssistantEventName =
  (typeof ASSISTANT_EVENTS)[keyof typeof ASSISTANT_EVENTS]

type EventProperties =
  | { surface: AssistantSurface }
  | { surface: AssistantSurface; source: QuestionSource }

/**
 * The surfaces already counted as opened. Module state, so it lasts as long
 * as the page load does: moving between / and /ask is a client-side
 * navigation, and a visitor who comes back to a surface has not opened it
 * again.
 */
const openedSurfaces = new Set<AssistantSurface>()

/**
 * The visitor's first interaction with a surface in this page load: a click
 * or tap on the composer or typing in it, opening the "See all questions"
 * list, or asking. Focus alone is not one, because /ask focuses its composer
 * itself on a desktop, which would make every visit to /ask count as opened.
 */
export function trackOpened(surface: AssistantSurface): void {
  if (openedSurfaces.has(surface)) return
  openedSurfaces.add(surface)
  send(ASSISTANT_EVENTS.opened, { surface })
}

/**
 * A question submitted, on the surface it was submitted from, counted at the
 * submission. A question asked on the homepage counts there, once; /ask
 * sending it after the hand-off does not count it again. A regenerate is not
 * a question asked. A question the route refused and handed back to the
 * composer counts again when it is sent again, as typed. Asking is an
 * interaction, so it opens the surface first if nothing else has.
 */
export function trackAsked(
  surface: AssistantSurface,
  source: QuestionSource
): void {
  trackOpened(surface)
  send(ASSISTANT_EVENTS.asked, { surface, source })
}

/**
 * A run whose answer holds the whole decline sentence (`isDecline`), whether
 * it finished, was stopped, or failed after the sentence was written. A
 * regenerate that declines again counts again.
 */
export function trackDeclined(surface: AssistantSurface): void {
  send(ASSISTANT_EVENTS.declined, { surface })
}

/**
 * A request refused at the rate limit, which shows the rate-limit notice: a
 * question or a regenerate, each refusal counted.
 */
export function trackRateLimited(surface: AssistantSurface): void {
  send(ASSISTANT_EVENTS.rateLimited, { surface })
}

/** Lets a test start from a fresh page load. */
export function forgetOpenedSurfaces(): void {
  openedSurfaces.clear()
}

function send(name: AssistantEventName, properties: EventProperties): void {
  try {
    track(name, properties)
  } catch {
    // Counting is never worth a visitor's question: a script that throws
    // here must not stop the click that called it from asking.
  }
}
