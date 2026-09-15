import type { ChatStatus } from 'ai'
import type { ChatMessageMetadata } from './handler'
import type { ChatSource } from './read-document'
import type { ChatErrorCode } from './validate'

/**
 * What the browser makes of a streamed answer (MTC-33).
 *
 * Every decision the transcript takes — which text to show, which chips, which
 * notice, which error copy — is made here, in one pure module, so it can be
 * asserted without a browser, a stream, or a model.
 *
 * It is also the one module in lib/chat that the client bundle may import, and
 * that is why it has no runtime imports at all. prompt.ts, validate.ts and
 * handler.ts all reach lib/knowledge, which reads the filesystem at module
 * scope; pulling any of them into a client component would break the build.
 * The three imports above are erased at compile time, so the shapes stay
 * defined once and the bytes stay on the server.
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

/** One assistant message, reduced to what the transcript renders. */
export interface AnswerView {
  /** The answer, with any `Sources:` trailer removed. */
  text: string
  /** The documents the server actually read. Authoritative; may be empty. */
  sources: readonly ChatSource[]
  /** Real text that stopped mid-sentence on the output cap. */
  truncated: boolean
  /** The run ended without a clean answer. Implied by `truncated`. */
  incomplete: boolean
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
    // The flags are present-or-absent on the wire, never `false`, so `=== true`
    // is a check that the key is set rather than a comparison of two booleans.
    incomplete: message.metadata?.incomplete === true,
    truncated: message.metadata?.truncated === true,
    // An answer with no chips is ordinary: a decline cites nothing, and the
    // server withholds them from a run that produced no answer at all.
    sources: message.metadata?.sources ?? [],
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
 * Source chips come from the server's `sources` metadata, so a `Sources:` line
 * in the prose would repeat them — in raw document ids, which mean nothing to
 * a visitor. Only a final line that opens with the literal prefix is taken,
 * which is specific enough that no sentence of a real answer is mistaken for
 * it. A half-written trailer stays on screen for the tokens it takes to finish
 * the word, which is the cost of not guessing at prefixes like "So".
 */
export function stripSourcesTrailer(text: string): string {
  const lastBreak = text.lastIndexOf('\n')
  if (!TRAILER_LINE.test(text.slice(lastBreak + 1))) return text
  return text.slice(0, Math.max(lastBreak, 0)).trimEnd()
}

const TRAILER_LINE = new RegExp(`^\\s*${SOURCES_TRAILER_PREFIX.trimEnd()}`)

/**
 * What the visually hidden status region says, if anything.
 *
 * Three words, because the transcript itself must not be a live region: with
 * `aria-live` on it, a screen reader would re-read the whole growing answer on
 * every streamed token. This announces that something is happening, that it
 * finished, or that it failed, and leaves the reading to the reader.
 *
 * Empty until there is something to report, so a page that has only just
 * loaded announces nothing at all.
 */
export function announcementFor(
  status: ChatStatus,
  hasAnswer: boolean
): 'Responding' | 'Response complete' | 'Error' | '' {
  if (status === 'error') return 'Error'
  if (status === 'submitted' || status === 'streaming') return 'Responding'
  return hasAnswer ? 'Response complete' : ''
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
 * A dropped connection, a request that never reached the route, and a model
 * that died mid-answer all arrive as an `Error` with a message written by
 * somewhere other than this route — the AI SDK's transport, or the browser's
 * fetch. None of them is copy to show a visitor, and none can be told apart
 * from the others with any certainty, so they share one true sentence.
 */
export const CHAT_UNKNOWN_ERROR_MESSAGE =
  'Something went wrong reaching the assistant. Try again in a moment, or email Matt at matt.trifilo@gmail.com.'

const CHAT_ERROR_CODES: ReadonlySet<string> = new Set<ChatErrorCode>([
  'disabled',
  'too_many_turns',
  'message_too_long',
  'budget_exceeded',
  'rate_limited',
  'invalid',
  'unavailable',
])

/**
 * Read the route's structured refusal back out of a `useChat` error.
 *
 * The AI SDK's transport rejects a non-2xx response with an `Error` whose
 * message is the raw body, so the route's `{ error: { code, message } }` is
 * sitting in `error.message` as JSON. Parsing it is what lets the UI render
 * the sentence the server chose — the limits, the kill switch and the
 * too-long question each explain themselves — instead of one flat "something
 * went wrong" for seven different situations.
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
