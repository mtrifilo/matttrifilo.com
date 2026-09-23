import { findSourcesTrailer, stripTrailers } from '@/lib/chat/answer'
import type { ChatMessageMetadata } from '@/lib/chat/handler'

/**
 * Reading the chat route's response the way the browser reads it (MTC-32).
 *
 * The eval provider calls `createChatHandler` directly and gets back the same
 * `Response` the route returns, so everything the suites assert on has to be
 * recovered from the UI message stream. That parsing is pure, so it lives
 * here with `bun test` coverage rather than inside the provider, which cannot
 * be tested without Vertex.
 *
 * Only the public shape of the stream is read: `text-delta` chunks, the
 * `finish` chunk and its message metadata, and an `error` chunk. Chunk types
 * this module does not know about are ignored, so a new part on the stream
 * (a progress part, say) cannot break the suites.
 */

/**
 * The message metadata the handler puts on the `finish` chunk.
 *
 * The handler's own type rather than a copy of it, so a field the route stops
 * sending stops compiling here instead of reading as an empty value forever.
 * The parser does not validate the stream against it: a run's metadata is
 * the route's, and this module only reads it back.
 */
export type StreamedMetadata = ChatMessageMetadata

export interface StreamedAnswer {
  /**
   * Every `text-delta` concatenated, trailer included. The browser strips the
   * `Sources:` line; the suites need it, so nothing is stripped here.
   */
  text: string
  /** The `finish` chunk's reason, when it carried one. */
  finishReason?: string
  /**
   * The `errorText` of an `error` chunk. The route writes its refusal
   * envelope there as JSON, so a failed run still names its own code.
   */
  errorText?: string
  metadata: StreamedMetadata
}

const DATA_PREFIX = 'data: '
const DONE = '[DONE]'

/**
 * Parse one SSE body into the answer, the finish reason, and the metadata.
 *
 * Malformed frames are skipped rather than thrown on: a run that produced
 * half a stream should be reported as a failing test with whatever text it
 * did produce, not as a crash that takes the other tests down with it.
 */
export function parseUiMessageStream(body: string): StreamedAnswer {
  const answer: StreamedAnswer = { text: '', metadata: {} }

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith(DATA_PREFIX)) continue
    const payload = line.slice(DATA_PREFIX.length)
    if (payload === DONE) continue

    const chunk = parseJson(payload)
    if (!chunk) continue

    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
      answer.text += chunk.delta
    }
    if (chunk.type === 'error' && typeof chunk.errorText === 'string') {
      answer.errorText = chunk.errorText
    }
    if (chunk.type === 'finish' && typeof chunk.finishReason === 'string') {
      answer.finishReason = chunk.finishReason
    }
    if (isRecord(chunk.messageMetadata)) {
      Object.assign(answer.metadata, chunk.messageMetadata)
    }
  }

  return answer
}

/**
 * The ids on the answer's own `Sources:` trailer, in the order the model
 * wrote them.
 *
 * This is the model's claim about what it used, which is exactly why the
 * groundedness suite checks it against the reads the server actually
 * performed. The line is found by the browser's own parser,
 * `findSourcesTrailer` in lib/chat/answer.ts, so a suite checks the line the
 * page hides and no other: a line the page would leave on screen as prose
 * (bold, lower case, or not the last line) carries no ids here either.
 */
export function sourcesTrailerIds(text: string): string[] {
  return findSourcesTrailer(text)?.ids ?? []
}

/**
 * The answer without either trailer, for assertions that read the prose.
 *
 * Exactly the text the transcript renders, less trailing whitespace, because
 * that is what a visitor reads. Taking the follow-ups block off matters as
 * much as the citation line: a suite reading past that marker would judge
 * the model's proposed questions as part of the answer, and a probe's
 * forbidden phrase inside a suggestion would read as an invented fact.
 */
export function answerProse(text: string): string {
  return stripTrailers(text).trimEnd()
}

/**
 * The row has nothing to grade: no prose at all, whatever else came back.
 *
 * A fact about the request rather than a judgement about the answer, which
 * is why the provider records it per test and the run summary counts it
 * (`transportFailures`): an assertion that checks for the absence of
 * something passes on an empty answer, so a run carrying such rows is not
 * evidence about the assistant and is not publishable.
 */
export function hasNothingToGrade(text: string): boolean {
  return answerProse(text).trim().length === 0
}

/**
 * The visitor-authored parts of an answer that must not be read as the
 * assistant's own voice: markdown block quotes and anything inside double
 * quotes.
 *
 * The corpus quotes Matt in the first person ("for my team's domain
 * ownership", "I've excelled at bringing cross-functional teams"), and an
 * answer is allowed to quote him back. A first-person check run over the raw
 * text would call every one of those a persona break, so quotations are
 * removed before the check and the check judges only the assistant's own
 * sentences.
 */
export function withoutQuotations(text: string): string {
  return text
    .split('\n')
    .filter(line => !/^\s*>/.test(line))
    .join('\n')
    .replace(/"[^"]*"/g, ' ')
    .replace(/“[^”]*”/g, ' ')
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
