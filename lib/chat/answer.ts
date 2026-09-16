import type { ChatStatus } from 'ai'
import type { ChatMessageMetadata } from './handler'
import { toProgressView, type ProgressView } from './progress'
import type { ChatErrorCode } from './validate'

/**
 * What the browser makes of a streamed answer (MTC-33).
 *
 * Every decision the transcript takes, which text to show, which notice,
 * which error copy, is made here, in one pure module, so it can be asserted
 * without a browser, a stream, or a model.
 *
 * It is one of the two modules in lib/chat that the client bundle may import,
 * and ./progress, which has no runtime imports of its own, is the only thing
 * it pulls in at runtime. prompt.ts, validate.ts and handler.ts all reach
 * lib/knowledge, which reads the filesystem at module scope; pulling any of
 * them into a client component would break the build. The type imports above
 * are erased at compile time, so the shapes stay defined once and the bytes
 * stay on the server.
 */

/**
 * Prefix of the citation line the policy asks the model to end an answer with.
 *
 * It lives here rather than in prompt.ts — where the rest of the model-facing
 * vocabulary lives — because the browser is the other half of this contract:
 * it is what has to recognise the line and take it back out again. prompt.ts
 * re-exports it so the policy prose still reads from a single constant.
 */
export const SOURCES_TRAILER_PREFIX = 'Sources: '

/**
 * Characters in one question. Roughly a long paragraph.
 *
 * Defined here for the same reason as the trailer prefix: both ends enforce
 * it. The route refuses a longer question with `message_too_long`; the
 * composer stops one being sent, because the route's refusal arrives after
 * the question has already left the box. validate.ts re-exports it.
 */
export const CHAT_MAX_MESSAGE_CHARS = 1_500

/** One assistant message, reduced to what the transcript renders. */
export interface AnswerView {
  /** The answer, with any `Sources:` trailer removed. */
  text: string
  /** Real text that stopped mid-sentence on the output cap. */
  truncated: boolean
  /** The run ended without a clean answer. Implied by `truncated`. */
  incomplete: boolean
  /**
   * The steps the server narrated while the answer was being prepared, and
   * how the run ended (MTC-42). Absent when the server sent no progress part
   * (a refusal that never opened a stream, or a run that answered without
   * reading anything), and absent when the part it did send was malformed.
   */
  progress?: ProgressView
}

/** The parts of a UI message this module needs. Structural on purpose. */
export interface AnswerMessage {
  parts: readonly { type: string; text?: string }[]
  metadata?: ChatMessageMetadata
}

export function toAnswerView(message: AnswerMessage): AnswerView {
  const text = stripSourcesTrailer(joinTextParts(message.parts))
  return {
    text,
    // Lenient: a progress part this module cannot read costs the visitor the
    // step list and nothing else. See lib/chat/progress.ts.
    progress: toProgressView(message.parts),
    // The flags are present-or-absent on the wire, never `false`, so `=== true`
    // is a check that the key is set rather than a comparison of two booleans.
    incomplete: message.metadata?.incomplete === true,
    truncated: message.metadata?.truncated === true,
  }
}

/** The text the model streamed, in order. Non-text parts never arrive. */
export function joinTextParts(
  parts: readonly { type: string; text?: string }[]
): string {
  let text = ''
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') text += part.text
  }
  return text
}

/**
 * The trailer is for the model's discipline, not the reader's eyes.
 *
 * The trailer is raw document ids, which mean nothing to a visitor: what was
 * read is disclosed above the answer, by title. Only a final line that opens
 * with the literal prefix is taken, which is specific enough that no sentence
 * of a real answer is mistaken for it. A half-written trailer stays on screen
 * for the tokens it takes to finish the word, which is the cost of not
 * guessing at prefixes like "So".
 */
export function stripSourcesTrailer(text: string): string {
  // Models routinely end with a newline; without this the "final line" would
  // be the empty string after it, and the trailer would stay on screen.
  const trimmed = text.trimEnd()
  const lastBreak = trimmed.lastIndexOf('\n')
  if (!TRAILER_LINE.test(trimmed.slice(lastBreak + 1))) return text
  return trimmed.slice(0, Math.max(lastBreak, 0)).trimEnd()
}

/** Which notice, if any, sits under an answer once its run has ended. */
export type AnswerNotice = 'truncated' | 'incomplete'

/**
 * A cut-short answer is still an answer, so it gets the notice that says to
 * ask something narrower. Every other run that did not end cleanly — no text
 * at all, or text that stopped on something other than the output cap, such
 * as a safety filter — gets the one that says to try again. `truncated`
 * without text falls into that second group: there is nothing to have been
 * cut short.
 */
export function noticeFor(view: AnswerView): AnswerNotice | null {
  const hasText = view.text.trim().length > 0
  if (view.truncated && hasText) return 'truncated'
  if (view.incomplete) return 'incomplete'
  return null
}

const TRAILER_LINE = new RegExp(`^\\s*${SOURCES_TRAILER_PREFIX.trimEnd()}`)

/**
 * What the visually hidden status region says, if anything.
 *
 * A few words, because the transcript itself must not be a live region: with
 * `aria-live` on it, a screen reader would re-read the whole growing answer on
 * every streamed token. This announces that something is happening, that it
 * finished, or that it failed, and leaves the reading to the reader.
 *
 * While a run is in flight it narrates the step instead of the bare
 * "Responding" (MTC-42), so a reader who cannot see the progress list is told
 * the same thing it shows. One announcement per step: the region re-reads
 * whenever this string changes, which is why the elapsed seconds are never in
 * it. A ticking counter would re-announce every second and bury the steps.
 *
 * Empty until there is something to report, so a page that has only just
 * loaded announces nothing at all.
 */
export function announcementFor(
  status: ChatStatus,
  hasAnswer: boolean,
  progress?: ProgressView
): string {
  if (status === 'error') return 'Error'
  if (status === 'submitted' || status === 'streaming') {
    return stepAnnouncement(progress) ?? 'Responding'
  }
  return hasAnswer ? 'Response complete' : ''
}

/**
 * The current step, said plainly. `undefined` when the run has not narrated
 * anything yet, or has already reported itself done. In both cases the
 * caller's "Responding" is the truthful thing to say.
 */
function stepAnnouncement(
  progress: ProgressView | undefined
): string | undefined {
  if (!progress) return undefined
  if (progress.phase === 'writing') return 'Writing answer'
  if (progress.phase !== 'reading') return undefined
  const current = progress.steps[progress.steps.length - 1]
  return current ? `Reading ${current.title}` : undefined
}

/** An error the transcript has to say something about. */
export interface ChatErrorView {
  code: ChatErrorCode
  /**
   * Copy to render as-is. `rate_limited` is the exception: MTC-33 renders its
   * own sentence with links, because a limit a visitor has just hit is the one
   * moment the static pages are more use than the assistant.
   */
  message: string
}

/**
 * Copy for anything that is not a refusal the server named.
 *
 * A dropped connection and a request that never reached the route arrive as
 * an `Error` with a message written by somewhere other than this route — the
 * AI SDK's transport, or the browser's fetch. Neither is copy to show a
 * visitor, and they cannot be told apart with any certainty, so they share
 * one true sentence.
 */
export const CHAT_UNKNOWN_ERROR_MESSAGE =
  'Something went wrong reaching the assistant. Try again in a moment, or email Matt at matt.trifilo@gmail.com.'

// A Record, not a list, so a code added to ChatErrorCode without being
// added here is a type error rather than a silent fall-through to the
// unknown-error copy.
const KNOWN_CODES: Record<ChatErrorCode, true> = {
  disabled: true,
  blocked: true,
  too_many_turns: true,
  message_too_long: true,
  budget_exceeded: true,
  rate_limited: true,
  invalid: true,
  unavailable: true,
  interrupted: true,
}
const CHAT_ERROR_CODES: ReadonlySet<string> = new Set(Object.keys(KNOWN_CODES))

/**
 * Refusals that were about the question just sent, not about the assistant.
 *
 * `useChat` puts the question into the transcript before the request and
 * leaves it there when the request fails, so after one of these the same
 * over-long or over-limit body is posted again on every later send. The
 * transcript has to let go of that question; the composer gets it back.
 */
export function discardsQuestion(code: ChatErrorCode): boolean {
  return (
    code === 'too_many_turns' ||
    code === 'message_too_long' ||
    code === 'budget_exceeded' ||
    code === 'invalid'
  )
}

/**
 * Read the route's structured refusal back out of a `useChat` error.
 *
 * The AI SDK's transport rejects a non-2xx response with an `Error` whose
 * message is the raw body, so the route's `{ error: { code, message } }` is
 * sitting in `error.message` as JSON. A model that fails once the stream is
 * open arrives the same way: the route writes the envelope into the stream's
 * error text. Parsing it is what lets the UI render the sentence the server
 * chose — the limits, the kill switch and the too-long question each explain
 * themselves — instead of one flat "something went wrong" for eight
 * different situations.
 *
 * Anything that is not that exact shape is treated as unknown rather than
 * shown. A message this route did not write is not copy.
 */
export function toChatErrorView(
  error: Error | undefined
): ChatErrorView | undefined {
  if (!error) return undefined

  const body = parseJson(error.message)
  if (isRecord(body) && isRecord(body.error)) {
    const { code, message } = body.error
    if (
      typeof code === 'string' &&
      CHAT_ERROR_CODES.has(code) &&
      typeof message === 'string' &&
      message.length > 0
    ) {
      return { code: code as ChatErrorCode, message }
    }
  }

  return { code: 'unavailable', message: CHAT_UNKNOWN_ERROR_MESSAGE }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
