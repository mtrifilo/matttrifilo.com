import type { ChatStatus } from 'ai'
import type { ChatMessageMetadata } from './handler'
import { toProgressView, wasCutOff, type ProgressView } from './progress'
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
 * Prefix of the second trailer: the line after `Sources:` that introduces the
 * follow-up questions the policy asks for (MTC-41).
 *
 * It sits beside the citation prefix for the same reason that one is here.
 * The questions themselves never reach the visitor as text: the browser takes
 * this block back out of the answer and renders the list the server validated
 * onto the message metadata, so an unvalidated proposal cannot appear even as
 * prose. It carries no trailing space because nothing follows it on its own
 * line; the questions are the lines after it.
 */
export const FOLLOW_UPS_TRAILER_PREFIX = 'Follow-ups:'

/** How many proposals a visitor is offered, whatever the model wrote. */
export const FOLLOW_UPS_MAX = 3

/**
 * Length bounds on one proposal, in characters.
 *
 * The floor rejects a fragment that is not a question anyone asked; the
 * ceiling is what a pill can carry in one line on a row that scrolls.
 */
export const FOLLOW_UP_MIN_CHARS = 12
export const FOLLOW_UP_MAX_CHARS = 140

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
  /** The answer, with both of the policy's trailers removed. */
  text: string
  /**
   * Questions the model proposed for the next turn, already validated
   * (MTC-41). Empty whenever there is no row to show: a decline, a run that
   * did not finish, or proposals that were all malformed.
   */
  followUps: readonly string[]
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
  const text = stripTrailers(joinTextParts(message.parts))
  return {
    text,
    // Validated again on the way in. The server is the gate, but these
    // strings are model output about to be rendered as buttons, and the one
    // place that decides what a well-formed proposal is should be the one
    // place that decides what gets drawn.
    followUps: takeFollowUps(stringsIn(message.metadata?.followUps)),
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

/**
 * Everything from the follow-ups marker to the end of the answer (MTC-41).
 *
 * The marker line and the questions under it are a channel to this code, not
 * to the reader: the row the visitor sees is drawn from the validated list on
 * the message metadata. So the whole block goes, from the last line that
 * opens with the literal prefix. The policy says nothing follows those
 * questions, and taking the block wholesale is what keeps a half-written
 * proposal off the screen while the rest of it streams in.
 */
export function stripFollowUpsTrailer(text: string): string {
  const marker = lastFollowUpsMarker(text.split('\n'))
  if (marker < 0) return text
  return text.split('\n').slice(0, marker).join('\n').trimEnd()
}

/** Both trailers, in the order they are written. */
export function stripTrailers(text: string): string {
  return stripSourcesTrailer(stripFollowUpsTrailer(text))
}

/**
 * The follow-up questions the model proposed, or an empty list (MTC-41).
 *
 * Everything below the marker is model output that will be drawn as a button
 * and, when tapped, sent back as the next question, so it is treated the way
 * any other untrusted text is: read as lines, judged one at a time, and kept
 * only if it is the shape the policy asked for. Scanning stops at the first
 * proposal that is not, rather than skipping it, so prose the model added
 * after its list can never be promoted into a pill.
 */
export function parseFollowUps(text: string): string[] {
  const lines = text.split('\n')
  const marker = lastFollowUpsMarker(lines)
  if (marker < 0) return []
  return takeFollowUps([
    // The policy puts the questions on the lines after the marker, but a
    // model that starts the first one on the marker line has still proposed
    // it, and dropping it would cost the visitor a pill for a formatting slip.
    lines[marker].replace(FOLLOW_UPS_LINE, ''),
    ...lines.slice(marker + 1),
  ])
}

/**
 * Whether one line is a proposal a visitor may be offered.
 *
 * Every clause is about what a hiring manager's next question looks like, and
 * every one of them also closes a way for model output to become something
 * other than a question in the visitor's hands: a link to follow, an address
 * to write to, markup the renderer might act on, or a line of instructions
 * dressed as a suggestion.
 */
export function isWellFormedFollowUp(question: string): boolean {
  if (
    question.length < FOLLOW_UP_MIN_CHARS ||
    question.length > FOLLOW_UP_MAX_CHARS
  ) {
    return false
  }
  if (!question.endsWith('?')) return false
  if (question.includes('@')) return false
  if (MARKDOWN_CHARACTER.test(question)) return false
  if (LINK.test(question)) return false
  if (CONTROL_CHARACTER.test(question)) return false
  return true
}

/** Index of the last line that opens the follow-ups block, or -1. */
function lastFollowUpsMarker(lines: readonly string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (FOLLOW_UPS_LINE.test(lines[index])) return index
  }
  return -1
}

/**
 * The first few well-formed, distinct proposals, in the order they were
 * written. Blank lines are skipped, because models space their lists out;
 * anything else that fails the check ends the list.
 */
function takeFollowUps(lines: readonly string[]): string[] {
  const kept: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (kept.length === FOLLOW_UPS_MAX) break
    const question = line.replace(LIST_MARKER, '').trim()
    if (question.length === 0) continue
    if (!isWellFormedFollowUp(question)) break
    const key = question.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(question)
  }
  return kept
}

/** The strings in a value that arrived as JSON, and nothing else. */
function stringsIn(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

const FOLLOW_UPS_LINE = new RegExp(`^\\s*${FOLLOW_UPS_TRAILER_PREFIX}`)

/** A bullet or number a model puts in front of a list item. */
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/

/** Characters markdown gives a meaning, so a pill cannot smuggle one in. */
const MARKDOWN_CHARACTER = /[*_`[\]<>|#~\\]/

const LINK = /https?:\/\/|www\.|mailto:/i

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

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
 * the same thing it shows, and it reports a run that was cut off as stopped
 * rather than complete. One announcement per step: the region re-reads
 * whenever this string changes, which is why the elapsed seconds are never in
 * it. A ticking counter would re-announce every second and bury the steps.
 *
 * Empty until there is something to report, so a page that has only just
 * loaded announces nothing at all.
 */
export function announcementFor(
  status: ChatStatus,
  hasAnswer: boolean,
  progress?: ProgressView,
  stopped = false
): string {
  if (status === 'error') return 'Error'
  if (status === 'submitted' || status === 'streaming') {
    return stepAnnouncement(progress) ?? 'Responding'
  }
  // A run that was cut off is never reported as finished. The reader has no
  // other way to learn it: the steps sit in the transcript, which is
  // deliberately not a live region, and the timer is hidden from them.
  // "Response complete" here would be the one false claim this view exists
  // to prevent, made in the only channel that cannot be checked by looking.
  //
  // Two signals, because neither covers the other. `stopped` is the visitor
  // pressing the button, which the SDK reports as an ordinary `ready` with
  // no error and no metadata; `wasCutOff` is a run that ended on its own
  // without the server ever saying `done`. A run that answered without
  // reading anything has no progress part at all, so only the first signal
  // can speak for it.
  if (stopped) return 'Response stopped'
  if (!hasAnswer) return ''
  if (wasCutOff(progress)) return 'Response stopped'
  return 'Response complete'
}

/**
 * The current step, said plainly. `undefined` when the run has not narrated
 * anything yet, or has already reported itself done. In both cases the
 * caller's "Responding" is the truthful thing to say.
 *
 * These three verbs are the spoken half of what
 * components/assistant/copy.ts shows on screen as "Reading {title}…",
 * "Checking GitHub for {name}…" and "Writing answer…". They are written out
 * here rather than imported because this module may not reach into
 * components; change one and change the other, or the two channels will
 * describe different work.
 */
function stepAnnouncement(
  progress: ProgressView | undefined
): string | undefined {
  if (!progress) return undefined
  if (progress.phase === 'writing') return 'Writing answer'
  if (progress.phase !== 'reading') return undefined
  const current = progress.steps[progress.steps.length - 1]
  if (!current) return undefined
  return current.kind === 'activity'
    ? `Checking GitHub for ${current.title}`
    : `Reading ${current.title}`
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
