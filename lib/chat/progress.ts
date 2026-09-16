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
 *
 * Dropping one would undercount the documents read, which is the same kind of
 * false claim this module exists to prevent, so the corpus is held well below
 * it: `lib/knowledge/knowledge.test.ts` fails if any title comes close.
 */
export const MAX_TITLE_CHARS = 200

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
  // Backwards, so the newest wins. The SDK merges a repeated data part into
  // the existing one, which leaves exactly one here; reading from the end
  // means a version that appended instead would show the latest step rather
  // than freezing on the first and reporting every answer as stopped.
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]
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

/**
 * The progress of a run the visitor stopped before the server narrated a
 * single step.
 *
 * Nothing arrives on that path: the stream carries no chunk that would make
 * the SDK create an assistant message, so there is no message to derive a
 * view from and no part to read. What the visitor did is still a real
 * ending, and it needs the same terminal state as any other, so the
 * transcript hands this in for the placeholder row. "Reading, no steps" is
 * exactly what an in-flight run that never got anywhere looks like, and
 * `progressStatus` reads it as `stopped` once the run is no longer pending.
 */
export const STOPPED_BEFORE_FIRST_STEP: ProgressView = {
  phase: 'reading',
  steps: [],
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

/**
 * Whether a run that is no longer in flight ended without finishing.
 *
 * One rule, read by both channels: `progressStatus` renders it, and
 * `announcementFor` in ./answer speaks it. A phase added to
 * ChatProgressPhase without a thought for this function would otherwise be
 * handled in the visible channel and missed in the one nobody sees break.
 */
export function wasCutOff(progress: ProgressView | undefined): boolean {
  return progress !== undefined && progress.phase !== 'done'
}

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
  return wasCutOff(progress) ? 'stopped' : 'done'
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
 * run finished, it read something, and it produced answer text. The third is
 * about text, not about the `incomplete` flag, which is deliberate: an answer
 * cut off on the output cap is stamped `incomplete` and is still real text
 * drawn from the documents that were read, so it keeps the count. A run that
 * wrote nothing at all keeps its steps expanded and claims nothing, because
 * "Read 3 documents" above an empty reply would be a sentence about work that
 * produced no answer.
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

/* ------------------------------------------------------------------ *
 * The shape of the rendered view. Decided here, drawn by                *
 * components/assistant/assistant-progress.tsx.                          *
 * ------------------------------------------------------------------ */

/** What a step row is doing, and therefore which icon it earns. */
export type StepState = 'complete' | 'active' | 'stopped'

/** One row of the disclosure, named by the step it reports. */
export interface ProgressRow {
  /** The step's document id, or the fixed key of the writing row. */
  key: string
  /** `undefined` on the writing row, which names no document. */
  title?: string
  state: StepState
}

/**
 * The rows, and which one the run is on.
 *
 * While reading, the last document is in flight and every earlier one is
 * done. While writing, every read is done and the answer row is in flight. A
 * stopped run kept whichever phase it stopped in, so it is the same list with
 * the row that was in flight marked as the place it stopped. A finished run
 * is all complete, and a run with nothing read yet has no rows at all.
 *
 * Rows carry titles rather than sentences: the wording is Matt's and lives in
 * components/assistant/copy.ts.
 */
export function progressRows(
  status: ProgressStatus,
  progress: ProgressView | undefined
): ProgressRow[] {
  const steps = progress?.steps ?? []
  const rows: ProgressRow[] = steps.map(step => ({
    // Prefixed, because the writing row's key is a literal and a document id
    // is a file name: `content/knowledge/<topic>/writing.md` would otherwise
    // give two rows the same React key.
    key: `read:${step.id}`,
    title: step.title,
    state: 'complete',
  }))
  if (rows.length === 0) return rows

  if (progress?.phase === 'writing') {
    rows.push({ key: WRITING_ROW_KEY, state: 'complete' })
  }
  if (status === 'done') return rows

  const current = rows[rows.length - 1]
  current.state = status === 'stopped' ? 'stopped' : 'active'
  return rows
}

/** The key of the row that reports the answer being written. */
export const WRITING_ROW_KEY = 'writing'

/** How a read row's key is built, so the two can never collide. */
export const READ_ROW_KEY_PREFIX = 'read:'

/**
 * Whole seconds for the live timer, or `undefined` when there is no clock to
 * show.
 *
 * Counted from zero rather than rounded up, so the first second reads `0s`
 * instead of claiming one that has not passed. An answer further up the
 * transcript has no clock at all: this tab stopped timing it when the next
 * question was asked, and a stale number beside it would be a worse answer
 * than none.
 */
export function progressSeconds(
  pending: boolean,
  elapsedMs: number
): number | undefined {
  if (!pending && elapsedMs <= 0) return undefined
  return Math.round(elapsedMs / 1000)
}

/**
 * Where the live elapsed clock belongs.
 *
 * Before any document is named, the header is the only line on screen, so
 * the clock sits there next to "Thinking…". Once steps exist, a clock on
 * the header next to a second status line is the duplicate the visitor
 * sees as two things working; it belongs on the active (or stopped) row.
 */
export function progressTimerPlacement(
  rows: readonly ProgressRow[]
): 'header' | 'step' {
  return rows.length === 0 ? 'header' : 'step'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
