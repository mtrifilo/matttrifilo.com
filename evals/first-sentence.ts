import { PROGRESS_PART_TYPE } from '@/lib/chat/progress'
import * as assertions from './assertions'
import type { AssertionContext, AssertionResult } from './assertions'
import { createKeptText, type KeptToken } from './route-stream'

/**
 * The pure half of evals/measure-first-sentence.ts (MTC-87): reading the
 * chat route's stream as it arrives, deciding when the first sentence became
 * readable, and grading an answer on its golden's deterministic assertions.
 *
 * It lives apart from the script so `bun test` covers it without loading
 * Vertex, the same split as route-stream.ts and provider.ts.
 */

/**
 * The shortest first sentence that counts. A lead sentence a hiring manager
 * could forward is longer than this; the floor stops "Short answer: yes." or
 * a bold label from being timed as the useful sentence.
 */
export const FIRST_SENTENCE_MIN_CHARS = 40

/**
 * Which rule ended the first sentence.
 *
 * `punctuation`: a full stop, question mark or exclamation mark followed by
 * whitespace, at or past the floor. `line`: a line break at or past the floor
 * with no such punctuation before it, which is how a list-shaped or
 * heading-led answer ends its first readable unit. `end`: the answer finished
 * before either, so the whole answer is the first sentence. `none`: no
 * answer text arrived at all.
 */
export type SentenceRule = 'punctuation' | 'line' | 'end' | 'none'

/**
 * Where the first sentence of `text` ends, as an exclusive index, or
 * undefined while it has not ended yet.
 *
 * `finished` says the text is the whole answer, so terminal punctuation at
 * the very end counts; mid-stream it does not, because the next chunk could
 * still be "5 billion" after "1.".
 *
 * A heuristic with known limits: it ends early at an abbreviation past the
 * floor ("e.g. ", "U.S. "), it runs past a stop followed by a closing quote
 * or bracket, and it takes a heading or bold label of 40 characters as the
 * sentence. The answer streams token by token (MTC-101), so each of these
 * moves a timing: an abbreviation ends the sentence early, a closing quote
 * late. Read the `rule` and the answer before trusting an outlier.
 */
export function firstSentenceEnd(
  text: string,
  finished: boolean,
  minChars: number = FIRST_SENTENCE_MIN_CHARS
): { end: number; rule: Exclude<SentenceRule, 'none'> } | undefined {
  for (let index = minChars - 1; index < text.length; index++) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '.' || char === '?' || char === '!') {
      if (next === undefined ? finished : /\s/.test(next)) {
        return { end: index + 1, rule: 'punctuation' }
      }
    }
    // `index >= minChars` rather than the loop's start: a line break ends the
    // text before it, so the line must already hold the floor's 40 characters.
    if (
      char === '\n' &&
      index >= minChars &&
      text.slice(0, index).trim().length > 0
    ) {
      return { end: index, rule: 'line' }
    }
  }
  if (finished && text.trim().length > 0) {
    return { end: text.length, rule: 'end' }
  }
  return undefined
}

/**
 * Text the visitor saw and then lost: a step streamed it and a `reset-step`
 * withdrew it when the step turned out to call a tool (MTC-101).
 */
export interface StreamRetraction {
  /** When its first token arrived, in ms from the send. */
  shownMs: number
  /** How long it was on screen before the withdrawal, in ms. */
  visibleMs: number
  /** How much of it there was, in characters. */
  chars: number
}

/** When each event a visitor waits for first happened, in ms from the send. */
export interface StreamTimings {
  /** The first progress part: the first sign on screen that work started. */
  firstProgressMs?: number
  /**
   * The first non-empty `text-delta` of any kind: the first text on screen,
   * narration that was later withdrawn included.
   */
  firstShownTokenMs?: number
  /** The first non-empty `text-delta` of the answer the browser kept. */
  firstAnswerTokenMs?: number
  /** When the kept answer first held a whole first sentence. */
  firstSentenceMs?: number
  sentenceRule: SentenceRule
  /** Every withdrawal, in the order it happened. */
  retractions: StreamRetraction[]
  /** The stream's end. */
  totalMs: number
  /** The kept answer's text, so a caller can check the rule it fired. */
  text: string
}

export interface StreamTimeline {
  /** Feed decoded body text as it arrives. */
  push: (chunk: string) => void
  /** The stream has ended; returns the timings. */
  finish: () => StreamTimings
}

/**
 * Reads the UI message stream incrementally and stamps the first arrival of
 * each event against `now`, relative to `startedAt`.
 *
 * Frames are split on newlines with the partial last line carried over, so a
 * frame split across two network chunks is stamped when its end arrives,
 * which is when a browser could have acted on it too.
 *
 * Text is kept the way the browser keeps it (`createKeptText` in
 * ./route-stream, shared with the eval parser): a `reset-step` withdraws the
 * current step's text (recorded as a retraction), an `error` ends the
 * reading, and only the text no reset took back is the answer. The first
 * progress part is stamped on arrival even if a reset later drops it, since
 * the visitor saw it; the route never sends one before a reset in the same
 * step. Whether a step's text is kept is
 * known only once the next step begins or the stream ends, so the answer's
 * first token and first sentence are worked out at `finish`, from the kept
 * tokens and the times they arrived.
 */
export function createStreamTimeline(
  startedAt: number,
  now: () => number
): StreamTimeline {
  let buffer = ''
  const kept = createKeptText()
  let firstProgressMs: number | undefined

  function onLine(rawLine: string, at: number): void {
    const line = rawLine.trim()
    if (!line.startsWith('data: ')) return
    const payload = line.slice('data: '.length)
    if (payload === '[DONE]') return
    let chunk: unknown
    try {
      chunk = JSON.parse(payload)
    } catch {
      return
    }
    if (typeof chunk !== 'object' || chunk === null) return
    const typed = chunk as { type?: unknown; delta?: unknown }
    if (typed.type === PROGRESS_PART_TYPE && firstProgressMs === undefined) {
      firstProgressMs = at - startedAt
    }
    kept.read(typed, at)
  }

  /** When the kept answer's first sentence was whole, and by which rule. */
  function sentenceOf(tokens: readonly KeptToken[]): {
    ms?: number
    rule: SentenceRule
  } {
    let text = ''
    for (const token of tokens) {
      text += token.delta
      const found = firstSentenceEnd(text, false)
      if (found) return { ms: token.at - startedAt, rule: found.rule }
    }
    // Only the whole answer can settle it now, and it was readable when its
    // last token arrived, not when the stream closed.
    const last = tokens.at(-1)
    const found = last ? firstSentenceEnd(text, true) : undefined
    if (last && found) return { ms: last.at - startedAt, rule: found.rule }
    return { rule: 'none' }
  }

  return {
    push(chunk) {
      const at = now()
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) onLine(line, at)
    },
    finish() {
      const at = now()
      if (buffer !== '') onLine(buffer, at)
      buffer = ''
      const tokens = kept.tokens()
      const sentence = sentenceOf(tokens)
      const firstShownAt = kept.firstShownAt()
      return {
        ...(firstProgressMs !== undefined ? { firstProgressMs } : {}),
        ...(firstShownAt !== undefined
          ? { firstShownTokenMs: firstShownAt - startedAt }
          : {}),
        ...(tokens.length > 0
          ? { firstAnswerTokenMs: tokens[0].at - startedAt }
          : {}),
        ...(sentence.ms !== undefined ? { firstSentenceMs: sentence.ms } : {}),
        sentenceRule: sentence.rule,
        retractions: kept.withdrawals().map(withdrawal => ({
          shownMs: withdrawal.shownAt - startedAt,
          visibleMs: withdrawal.withdrawnAt - withdrawal.shownAt,
          chars: withdrawal.chars,
        })),
        totalMs: at - startedAt,
        text: kept.text(),
      }
    },
  }
}

/** One entry of a suite's `assert` list, as the YAML holds it. */
export interface SuiteAssertion {
  type?: unknown
  value?: unknown
  assert?: SuiteAssertion[]
}

/**
 * Assertions that spend another live request, so this measurement skips
 * them: a timing run must not double its own traffic to grade itself.
 */
const LIVE_ASSERTIONS = new Set(['assertFollowUpsAnswerable'])

const ASSERTION_FILE_PREFIX = 'file://assertions.ts:'

export interface DeterministicGrade {
  /** Every deterministic assertion passed. */
  pass: boolean
  /** Names of the assertions that failed, with their reasons. */
  failed: string[]
  /** Assertions not run here: judged, live, or of a type this does not run. */
  skipped: string[]
}

/**
 * Run the deterministic half of a golden: the named functions in
 * assertions.ts and promptfoo's case-insensitive substring checks. The
 * llm-rubric sets are judgment and are skipped, as are assertions that make
 * a live request; each skip is named so a reader sees what was not checked.
 */
export async function gradeDeterministic(
  entries: readonly SuiteAssertion[],
  output: string,
  context: AssertionContext
): Promise<DeterministicGrade> {
  const failed: string[] = []
  const skipped: string[] = []
  const lower = output.toLowerCase()
  const needles = (value: unknown): string[] =>
    (Array.isArray(value) ? value : [value]).filter(
      (entry): entry is string => typeof entry === 'string'
    )

  for (const entry of entries) {
    const type = String(entry.type)
    if (type === 'javascript' && typeof entry.value === 'string') {
      const name = entry.value.startsWith(ASSERTION_FILE_PREFIX)
        ? entry.value.slice(ASSERTION_FILE_PREFIX.length)
        : undefined
      const assertion = name
        ? (assertions as Record<string, unknown>)[name]
        : undefined
      if (!name || typeof assertion !== 'function') {
        skipped.push(`javascript ${entry.value}`)
        continue
      }
      if (LIVE_ASSERTIONS.has(name)) {
        skipped.push(`${name} (live request)`)
        continue
      }
      const result = (await assertion(output, context)) as AssertionResult
      if (!result.pass) failed.push(`${name}: ${result.reason}`)
      continue
    }
    if (type === 'icontains' || type === 'icontains-any') {
      const list = needles(entry.value)
      if (!list.some(needle => lower.includes(needle.toLowerCase()))) {
        failed.push(`${type}: none of ${JSON.stringify(list)}`)
      }
      continue
    }
    if (type === 'icontains-all') {
      const missing = needles(entry.value).filter(
        needle => !lower.includes(needle.toLowerCase())
      )
      if (missing.length > 0) {
        failed.push(`${type}: missing ${JSON.stringify(missing)}`)
      }
      continue
    }
    if (type === 'not-icontains') {
      const present = needles(entry.value).filter(needle =>
        lower.includes(needle.toLowerCase())
      )
      if (present.length > 0) {
        failed.push(`${type}: contains ${JSON.stringify(present)}`)
      }
      continue
    }
    skipped.push(type === 'assert-set' ? 'assert-set (llm-rubric)' : type)
  }
  return { pass: failed.length === 0, failed, skipped }
}

/**
 * Nearest-rank percentile, the method the runbook's latency tables use, so a
 * figure here is comparable to theirs. Undefined for an empty sample.
 */
export function nearestRank(
  values: readonly number[],
  percentile: number
): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length))
  return sorted[rank - 1]
}
