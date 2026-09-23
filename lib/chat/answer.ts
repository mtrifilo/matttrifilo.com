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
 * It sits beside the citation prefix for the same reason that one is here,
 * and the mechanism is the same: the block travels down the stream inside
 * the answer and the browser takes it back out before the transcript renders
 * a word. Nothing is ever drawn as a pill except the validated list on the
 * message metadata, so a proposal that failed the check is never a button;
 * what a marker this module cannot recognise costs is a block left on screen
 * as prose, which is why the matching below is deliberately generous.
 *
 * It carries no trailing space because nothing follows it on its own line;
 * the questions are the lines after it.
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
 *
 * It reads the final line of the text it is given, so it expects text the
 * follow-ups block is already off; `stripTrailers` and `findSourcesTrailer`
 * take the whole answer.
 */
export function stripSourcesTrailer(text: string): string {
  return citationLineAtEnd(text)?.prose ?? text
}

/** An answer's citation line, split from the prose above it. */
export interface SourcesTrailer {
  /** Everything above the citation line, trailing whitespace removed. */
  prose: string
  /**
   * The ids the line names, in the order written, each trimmed of whitespace
   * and of the full stop or semicolon a model ends a list with. Empty when
   * the line names none, as a line still being streamed does.
   */
  ids: string[]
}

/**
 * The citation line of a whole answer, found by exactly the steps
 * `stripTrailers` takes to hide it, or `undefined` when there is none.
 *
 * The evals read the model's citations through this rather than through a
 * parser of their own, so the line the transcript hides and the line a suite
 * checks against the server's reads are the same line by construction: a
 * form the page leaves on screen as prose is a form the suites count as no
 * trailer at all.
 */
export function findSourcesTrailer(text: string): SourcesTrailer | undefined {
  const found = citationLineAtEnd(withoutFollowUps(text))
  if (!found) return undefined
  return {
    prose: found.prose,
    ids: found.line
      .slice(found.line.indexOf(':') + 1)
      .split(',')
      .map(id => id.trim().replace(/[.;]+$/, ''))
      .filter(id => id.length > 0),
  }
}

/**
 * Everything from the follow-ups marker to the end of the answer (MTC-41).
 *
 * The marker line and the questions under it are a channel to this code, not
 * to the reader: the row the visitor sees is drawn from the validated list on
 * the message metadata. So the whole block goes, from the FIRST marker line
 * on. First and not last, because a model that writes the marker twice would
 * otherwise leave the earlier block on screen as prose, which is the one
 * thing taking the block wholesale exists to prevent.
 */
export function stripFollowUpsTrailer(text: string): string {
  const lines = text.split('\n')
  const marker = followUpsMarker(lines)
  if (marker < 0) return text
  return lines.slice(0, marker).join('\n').trimEnd()
}

/**
 * Both trailers, in the order they are written.
 *
 * The middle step is the window between them. Text reaches the browser a step
 * at a time rather than a token at a time, but the chunks of one step still
 * arrive as separate frames, so there is a paint or two in which the marker
 * is half written and the citation line is no longer the last line. Without
 * it the raw document ids show for those frames.
 */
export function stripTrailers(text: string): string {
  return stripSourcesTrailer(withoutFollowUps(text))
}

/** The answer with the follow-ups block, whole or half written, taken off. */
function withoutFollowUps(text: string): string {
  return stripPartialFollowUpsMarker(stripFollowUpsTrailer(text))
}

/**
 * The final line, when it is the citation line.
 *
 * Models routinely end with a newline; without the trim the "final line"
 * would be the empty string after it, and the trailer would stay on screen.
 */
function citationLineAtEnd(
  text: string
): { prose: string; line: string } | undefined {
  const trimmed = text.trimEnd()
  const lastBreak = trimmed.lastIndexOf('\n')
  const line = trimmed.slice(lastBreak + 1)
  if (!TRAILER_LINE.test(line)) return undefined
  return { prose: trimmed.slice(0, Math.max(lastBreak, 0)).trimEnd(), line }
}

/**
 * The follow-up questions the model proposed, or an empty list (MTC-41).
 *
 * Everything below the marker is model output that will be drawn as a button
 * and, when tapped, sent back as the next question, so it is treated the way
 * any other untrusted text is: read as lines and judged one at a time.
 *
 * Two failures are distinguished on purpose. A line that is not a question at
 * all is the model writing past its list, and nothing below it is a proposal
 * either, so scanning stops there: prose can never be promoted into a pill. A
 * line that is a question but breaks one of the other rules is dropped on its
 * own, because one stray character is not a reason to withhold the proposals
 * around it.
 */
export function parseFollowUps(text: string): string[] {
  const lines = text.split('\n')
  const marker = followUpsMarker(lines)
  if (marker < 0) return []
  return takeFollowUps(lines.slice(marker + 1))
}

/**
 * Whether a finished answer shows a row of proposals (MTC-41).
 *
 * The conditions live here, together and testable, rather than as a
 * expression in the transcript: which answer may offer more is a decision
 * about the conversation, and it was split across two components before it
 * was written down.
 *
 * `truncated` is named as well as `incomplete` even though the server always
 * sets both: this view is the browser's own reading of the answer, and it
 * should not depend on a rule enforced in another module.
 */
export interface FollowUpRowState {
  view: AnswerView
  /** This is the answer the conversation has arrived at. */
  isLast: boolean
  /** Nothing is in flight: no question sent, no stream open, no error. */
  ready: boolean
  /** The visitor stopped the most recent run. */
  stopped: boolean
}

export function showsFollowUps({
  view,
  isLast,
  ready,
  stopped,
}: FollowUpRowState): boolean {
  if (!isLast || !ready || stopped) return false
  if (view.incomplete || view.truncated) return false
  // Proposals under an empty bubble would be a row of questions about an
  // answer the visitor never got.
  if (view.text.trim().length === 0) return false
  return view.followUps.length > 0
}

/**
 * Index of the line that opens the follow-ups block, or -1.
 *
 * The marker has to be alone on its line, which is what the policy asks for
 * and what keeps an ordinary sentence opening "Follow-ups: ..." from
 * truncating a real answer. Around that it is read generously: a model that
 * bolds the label or shouts it has still written the trailer, and the block
 * has to come off the screen either way.
 */
function followUpsMarker(lines: readonly string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    if (FOLLOW_UPS_MARKER_LINE.test(lines[index])) return index
  }
  return -1
}

/**
 * A trailing line that is the marker only half written.
 *
 * Taken only when the line above it is the citation line, which is the one
 * place this can happen and the only place it matters: without it the raw
 * document ids stop being the final line for a frame and render as prose.
 */
function stripPartialFollowUpsMarker(text: string): string {
  const trimmed = text.trimEnd()
  const lastBreak = trimmed.lastIndexOf('\n')
  if (lastBreak < 0) return text
  const lastLine = trimmed.slice(lastBreak + 1).trim()
  if (lastLine.length === 0) return text
  if (!FOLLOW_UPS_TRAILER_PREFIX.startsWith(lastLine)) return text
  const rest = trimmed.slice(0, lastBreak).trimEnd()
  if (!TRAILER_LINE.test(rest.slice(rest.lastIndexOf('\n') + 1))) return text
  return rest
}

/**
 * Whether one question is a proposal a visitor may be offered.
 *
 * The length bounds are what a pill can carry and what a real question is
 * longer than. The rest close the ways model output could become something
 * other than a question in the visitor's hands: a link to follow, an address
 * to write to, markup the renderer might act on, or characters that make a
 * pill read as one thing and send another.
 *
 * It does not, and cannot, tell a question from an instruction phrased as
 * one. Nothing here needs to: a tapped pill arrives at the route as an
 * ordinary visitor question, which the policy already treats as untrusted
 * text with no authority over anything.
 */
function isWellFormedFollowUp(question: string): boolean {
  if (
    question.length < FOLLOW_UP_MIN_CHARS ||
    question.length > FOLLOW_UP_MAX_CHARS
  ) {
    return false
  }
  if (!question.endsWith('?')) return false
  if (question.includes('@')) return false
  if (MARKDOWN_CHARACTER.test(question)) return false
  if (SCHEME_URL.test(question)) return false
  if (HOST_PATH_URL.test(question)) return false
  if (WWW_URL.test(question)) return false
  if (INVISIBLE_CHARACTER.test(question)) return false
  if (TAG_CHARACTER.test(question)) return false
  return true
}

/**
 * The first few well-formed, distinct proposals, in the order they were
 * written. Blank lines are skipped, because models space their lists out.
 *
 * One function guards both ends of the wire: it reads the model's lines on
 * the server and it reads the list back off the metadata in the browser, so a
 * proposal is judged by the same rules wherever it is drawn.
 */
function takeFollowUps(lines: readonly string[]): string[] {
  const kept: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (kept.length === FOLLOW_UPS_MAX) break
    const question = unwrapQuotes(line.replace(LIST_MARKER, '').trim())
    if (question.length === 0) continue
    if (!question.endsWith('?')) break
    if (!isWellFormedFollowUp(question)) continue
    const key = question.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(question)
  }
  return kept
}

/** One pair of wrapping quotes, which a model adds and a pill should not. */
function unwrapQuotes(text: string): string {
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length > 1 && text.startsWith(open) && text.endsWith(close)) {
      return text.slice(1, -1).trim()
    }
  }
  return text
}

/** The strings in a value that arrived as JSON, and nothing else. */
function stringsIn(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * The marker line, read generously.
 *
 * Written out rather than built from FOLLOW_UPS_TRAILER_PREFIX: a prefix
 * containing a regular-expression character would otherwise change what this
 * matches without anyone editing it. answer.test.ts pins the two together.
 */
const FOLLOW_UPS_MARKER_LINE =
  /^[\s#>]*[*_]*\s*follow[\s\u2010-\u2015-]?ups\s*:?\s*[*_]*\s*$/i

/** A bullet or number a model puts in front of a list item. */
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/

const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ['“', '”'],
  ["'", "'"],
]

/** Characters markdown gives a meaning, so a pill cannot smuggle one in. */
const MARKDOWN_CHARACTER = /[*_`[\]<>|#~\\]/

/*
 * The link and invisible-character shapes, kept the same as the ones
 * lib/chat/github-activity.ts applies to third-party text, and for the
 * reasons its comments give: any scheme rather than only http, a bare host
 * with a path because that is the shape a renderer turns into a live anchor,
 * and the bidi and zero-width ranges because they let rendered text differ
 * from the bytes behind it. They are written again rather than imported
 * because that module reaches lib/knowledge through ./validate and this one
 * is in the client bundle. answer.test.ts holds them to the same cases.
 */
const SCHEME_URL = /\b[a-z][\w+.-]*:\/\//i
const HOST_PATH_URL = /\b[\w-]+(?:\.[\w-]+)+\//
const WWW_URL = /\bwww\./i
const INVISIBLE_CHARACTER =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufff9-\ufffb\ufeff]/
const TAG_CHARACTER = /[\u{E0000}-\u{E007F}]/u

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
