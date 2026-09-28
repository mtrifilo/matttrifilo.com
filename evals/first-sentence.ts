import { PROGRESS_PART_TYPE } from '@/lib/chat/progress'
import * as assertions from './assertions'
import type { AssertionContext, AssertionResult } from './assertions'

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
    if (char === '\n' && text.slice(0, index).trim().length > 0) {
      return { end: index, rule: 'line' }
    }
  }
  if (finished && text.trim().length > 0) {
    return { end: text.length, rule: 'end' }
  }
  return undefined
}

/** When each event a visitor waits for first happened, in ms from the send. */
export interface StreamTimings {
  /** The first progress part: the first sign on screen that work started. */
  firstProgressMs?: number
  /** The first non-empty `text-delta`: the answer's first visible token. */
  firstAnswerTokenMs?: number
  /** When the text so far first held a whole first sentence. */
  firstSentenceMs?: number
  sentenceRule: SentenceRule
  /** The stream's end. */
  totalMs: number
  /** Every `text-delta` joined, so a caller can check the rule it fired. */
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
 */
export function createStreamTimeline(
  startedAt: number,
  now: () => number
): StreamTimeline {
  let buffer = ''
  let text = ''
  let lastTextAt: number | undefined
  const timings: Omit<StreamTimings, 'totalMs' | 'text' | 'sentenceRule'> & {
    sentenceRule?: SentenceRule
  } = {}

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
    const { type, delta } = chunk as { type?: unknown; delta?: unknown }
    if (type === PROGRESS_PART_TYPE && timings.firstProgressMs === undefined) {
      timings.firstProgressMs = at - startedAt
    }
    if (type === 'text-delta' && typeof delta === 'string' && delta !== '') {
      timings.firstAnswerTokenMs ??= at - startedAt
      text += delta
      lastTextAt = at
      if (timings.firstSentenceMs === undefined) {
        const found = firstSentenceEnd(text, false)
        if (found) {
          timings.firstSentenceMs = at - startedAt
          timings.sentenceRule = found.rule
        }
      }
    }
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
      let sentenceRule = timings.sentenceRule
      let firstSentenceMs = timings.firstSentenceMs
      if (firstSentenceMs === undefined && lastTextAt !== undefined) {
        // Only the whole answer can settle it now, and it was readable when
        // its last token arrived, not when the stream closed.
        const found = firstSentenceEnd(text, true)
        if (found) {
          firstSentenceMs = lastTextAt - startedAt
          sentenceRule = found.rule
        }
      }
      return {
        ...(timings.firstProgressMs !== undefined
          ? { firstProgressMs: timings.firstProgressMs }
          : {}),
        ...(timings.firstAnswerTokenMs !== undefined
          ? { firstAnswerTokenMs: timings.firstAnswerTokenMs }
          : {}),
        ...(firstSentenceMs !== undefined ? { firstSentenceMs } : {}),
        sentenceRule: sentenceRule ?? 'none',
        totalMs: at - startedAt,
        text,
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
