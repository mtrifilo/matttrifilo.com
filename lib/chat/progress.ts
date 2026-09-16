import type { AnswerView } from './answer'

/**
 * What the assistant is doing while the visitor waits, and what it did once
 * the answer has arrived (MTC-42).
 *
 * The wait is the reason this module exists: the model reads one to three
 * documents before it writes a word, and that is ten to twenty seconds in
 * which three shimmer bars said nothing. The server narrates the run as one
 * data part that it rewrites in place; this module is the browser's half:
 * reading that part back, deciding which of six states the run is in, and
 * writing the one line that survives once the answer is on screen.
 *
 * Two rules shape everything below.
 *
 * The first is that it must be client-safe. It is imported by
 * `components/assistant`, so it has no runtime imports at all and reaches
 * nothing that touches `lib/knowledge`, which reads the filesystem at module
 * scope. It decides counts and states, never sentences: the copy for them
 * lives in `components/assistant/copy.ts`, where the rest of the visitor-
 * facing strings are.
 *
 * The second is that it must never claim more than happened. A run that
 * stops (a dropped stream, a timeout, the visitor's Stop button, a closed
 * tab) ends without the server's `done`, and every function here reads that
 * absence as "stopped", never as a finished read of N documents. Validation
 * is lenient for the same reason: a malformed part costs the visitor the
 * step list, never the answer it sits above.
 */

/* ------------------------------------------------------------------ *
 * The wire shape. Shared with lib/chat/handler.ts, which is the only  *
 * thing that ever writes it.                                          *
 * ------------------------------------------------------------------ */

/**
 * Where the run has got to.
 *
 * `done` is the only terminal value, and the server sends it exactly once,
 * immediately before the stream's finish chunk. Nothing else means the run
 * ended: a stream that stops mid-read simply never sends another part.
 */
export type ChatProgressPhase = 'reading' | 'writing' | 'done'

/** One document the model asked for, named by the server's index. */
export interface ChatProgressStep {
  id: string
  title: string
}

export interface ChatProgress {
  steps: ChatProgressStep[]
  phase: ChatProgressPhase
  /** Wall-clock milliseconds for the whole run. Only sent with `done`. */
  ms?: number
}

/** The data parts this route streams. One, and it is server-authored. */
export type ChatDataParts = { progress: ChatProgress }

/** The part type on the wire, spelled once. */
export const PROGRESS_PART_TYPE = 'data-progress'

/**
 * The id every progress chunk carries.
 *
 * The AI SDK replaces a data part's `data` in place when an incoming chunk
 * matches an existing part's type and id, and appends a new part otherwise,
 * so one constant id is what makes a growing step list one part rather than
 * a part per step.
 */
export const PROGRESS_PART_ID = 'progress'

/* ------------------------------------------------------------------ *
 * Reading the part back.                                              *
 * ------------------------------------------------------------------ */

/** A progress part that has been checked. Same shape, read-only. */
export interface ProgressView {
  steps: readonly ChatProgressStep[]
  phase: ChatProgressPhase
  ms?: number
}

/**
 * A title longer than this is not a title from the index, where the longest
 * in the corpus is a few words, so it is a part worth distrusting rather than
 * rendering. Dropped rather than truncated: a step whose name cannot be
 * shown honestly is better left out than shown cut in half.
 */
const MAX_TITLE_CHARS = 200

const PHASES: ReadonlySet<string> = new Set<ChatProgressPhase>([
  'reading',
  'writing',
  'done',
])

/**
 * The progress part of a message, if it carries a usable one.
 *
 * Validated here rather than through `useChat`'s `dataPartSchemas`, which is
 * the other way the SDK offers to do this. A schema failure there errors the
 * whole stream, so a cosmetic part with an unexpected field would throw away
 * a finished answer. This is the opposite trade: anything that does not
 * check out yields `undefined`, the step list disappears, and the answer is
 * untouched. It never throws.
 */
export function toProgressView(
  parts: ReadonlyArray<{ type: string }>
): ProgressView | undefined {
  const data = findProgressData(parts)
  if (!isRecord(data)) return undefined

  const { phase, steps, ms } = data
  if (typeof phase !== 'string' || !PHASES.has(phase)) return undefined
  if (!Array.isArray(steps)) return undefined

  const view: ProgressView = {
    phase: phase as ChatProgressPhase,
    steps: readSteps(steps),
  }
  if (ms === undefined) return view
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return undefined
  return { ...view, ms }
}

function findProgressData(parts: ReadonlyArray<{ type: string }>): unknown {
  for (const part of parts) {
    // `?.` rather than a type guard: the array is typed, but it comes from a
    // stream the browser assembled, and a hole in it must not throw here.
    if (part?.type !== PROGRESS_PART_TYPE) continue
    return (part as { data?: unknown }).data
  }
  return undefined
}

/** Steps that name a document. A malformed entry is dropped, not fatal. */
function readSteps(steps: readonly unknown[]): ChatProgressStep[] {
  const kept: ChatProgressStep[] = []
  for (const step of steps) {
    if (!isRecord(step)) continue
    const { id, title } = step
    if (typeof id !== 'string' || typeof title !== 'string') continue
    if (title.length === 0 || title.length > MAX_TITLE_CHARS) continue
    kept.push({ id, title })
  }
  return kept
}

/* ------------------------------------------------------------------ *
 * What the transcript renders.                                        *
 * ------------------------------------------------------------------ */

/**
 * The six states a progress view can be rendered in.
 *
 * `stopped` and `none` are the two that keep MTC-42 honest. Every way a run
 * can end without an answer lands in one of them, and neither spins, ticks,
 * or counts documents.
 */
export type ProgressStatus =
  'thinking' | 'reading' | 'writing' | 'done' | 'stopped' | 'none'

export function progressStatus(
  view: AnswerView,
  pending: boolean
): ProgressStatus {
  const progress = view.progress

  if (pending) {
    // The seconds before the first tool call: the model is choosing what to
    // read and has told us nothing yet.
    if (!progress || progress.steps.length === 0) return 'thinking'
    // `done` arrives just ahead of the stream's finish chunk, so for the
    // frame or two before the status settles the run is already over.
    // Showing its final, collapsed form is both truthful and flicker-free.
    return progress.phase
  }

  // No part at all: a refusal that never opened a stream, or an ordinary run
  // that answered without reading anything. Neither has steps to show.
  if (!progress) return 'none'
  // The part exists but never reached `done`, so the run was cut off.
  return progress.phase === 'done' ? 'done' : 'stopped'
}

/** What a finished run may claim: how many documents, over how long. */
export interface ProgressTotals {
  count: number
  seconds: number
}

/**
 * The numbers behind the one line the steps collapse to, or `undefined` when
 * there is no claim to make.
 *
 * Three conditions, all of them about not overclaiming: the server said the
 * run finished, it read something, and an answer came of it. A run that
 * ended `incomplete` keeps its steps expanded under the existing notice and
 * claims nothing: "Read 3 documents" above an empty reply would be a
 * sentence about work that produced no answer.
 */
export function progressTotals(view: AnswerView): ProgressTotals | undefined {
  const progress = view.progress
  if (!progress || progress.phase !== 'done') return undefined
  if (progress.steps.length === 0) return undefined
  if (view.text.trim().length === 0) return undefined
  return { count: progress.steps.length, seconds: toSeconds(progress.ms ?? 0) }
}

/**
 * Whole seconds, never zero: a run that took 400 ms still took a moment, and
 * "in 0s" reads as a bug rather than as speed.
 */
export function toSeconds(ms: number): number {
  return Math.max(1, Math.round(ms / 1000))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
