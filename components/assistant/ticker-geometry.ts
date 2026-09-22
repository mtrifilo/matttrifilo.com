/**
 * The arithmetic behind the starter-question ticker (MTC-39, MTC-55).
 *
 * The pool is split across two rows. Each row is one track holding its own
 * half of the pool twice, moved by a CSS `transform` keyframe that travels
 * exactly one copy's width. Two coordinate systems therefore describe the
 * same row, and the component swaps between them whenever a pill takes focus:
 *
 * - **animation progress**, a fraction of one loop, which is what the CSS
 *   animation and its negative `animation-delay` speak;
 * - **scroll offset**, pixels of `scrollLeft`, which is what a browser moves
 *   to bring a focused element into view.
 *
 * Both rows travel right to left, so a pill enters at the right edge first
 * word first and is read as it arrives. Progress and scroll offset therefore
 * grow together: at progress p the row shows the pool from p of a copy in.
 *
 * Everything that converts between them, decides where a row opens, or
 * decides where a focused pill should sit, is here: it is pure, so it is
 * tested without a DOM, and the component is left with nothing but the event
 * plumbing.
 */

/**
 * How fast a row drifts. Slow enough to read a pill that is already on
 * screen, quick enough that a different question arrives while someone is
 * deciding: a pill crosses a 640px row in about eighteen seconds.
 */
export const TICKER_SPEED_PX_PER_SECOND = 35

/** How long a touch holds the rows still before they drift again. */
export const TOUCH_PAUSE_MS = 4000

/**
 * How many times a row's half of the pool is laid down in its track.
 *
 * It is here rather than in the component because the keyframe encodes the
 * same number: the track travels `100 / TICKER_COPIES` percent of its own
 * width, which equals one copy only while these two agree. ticker-css.test.ts
 * fails if the stylesheet and this constant ever drift apart.
 */
export const TICKER_COPIES = 2

/** The keyframe this arithmetic describes. Must match app/globals.css. */
export const TICKER_ANIMATION_NAME = 'starter-ticker'

/**
 * The custom property carrying the width of a row's edge gradient, in pixels.
 *
 * Declared by `.edge-faded-row` in app/globals.css and read back off the
 * element with `getComputedStyle`, so the name is a contract between two
 * languages and lives here as one string. lib/ticker-css.test.ts is what
 * keeps the stylesheet and this constant saying the same thing.
 */
export const EDGE_FADE_PROPERTY = '--edge-fade'

/**
 * The keyframe's two ends, which every conversion below assumes.
 *
 * The track starts unmoved and travels one copy to the left, so its content
 * walks leftwards past the viewport: a question appears at the right edge
 * with its first word and is legible as it arrives. Swapping these reverses
 * the row and mirrors every conversion here, which is why
 * lib/ticker-css.test.ts pins both.
 */
export const TICKER_KEYFRAME_FROM = 'translateX(0)'
export const TICKER_KEYFRAME_TO = `translateX(-${100 / TICKER_COPIES}%)`

/**
 * Which pill of each row sits against the left fade when a surface opens.
 *
 * The homepage opens each row on its first question. A visitor who submits
 * from there lands on /ask a second later, and rows that opened on the same
 * pills would look like they had not moved, so /ask opens about a third of
 * the way into each row. Both are whole pills rather than fractions of a
 * track, which is what keeps the opening from cutting a question in half.
 */
export const HOME_START_AT = 0
export const ASK_START_AT = 4

/**
 * The pool split across the two rows: the odd positions, then the even ones.
 *
 * Odd and even rather than first half and second half, because the pool is
 * ordered by what the reader most wants answered: halving it would bury the
 * leading questions at the back of the second row, while alternating leaves
 * both rows opening on one of them. Every question appears in exactly one
 * row, in the pool's order.
 */
export function tickerRows(
  pool: readonly string[]
): readonly [readonly string[], readonly string[]] {
  const odd = pool.filter((_, index) => index % 2 === 0)
  const even = pool.filter((_, index) => index % 2 === 1)
  return [odd, even]
}

/**
 * Seconds for one loop at the ticker's speed, given the width of one copy of
 * a row's questions. Zero width means the row has not been laid out yet; the
 * caller leaves the stylesheet's fallback in place rather than dividing by it.
 */
export function loopSeconds(copyWidth: number): number | null {
  if (!Number.isFinite(copyWidth) || copyWidth <= 0) return null
  return copyWidth / TICKER_SPEED_PX_PER_SECOND
}

/**
 * Which pill of a row a surface's `startAt` names, wrapped into the row.
 *
 * The two rows hold a different number of questions, so a surface names one
 * index and each row resolves it against its own length rather than falling
 * off the end.
 */
export function pillIndexFor(startAt: number, count: number): number {
  if (!Number.isFinite(startAt) || count <= 0) return 0
  const index = Math.trunc(startAt)
  return ((index % count) + count) % count
}

/**
 * The animation progress that parks a pill's leading edge just clear of the
 * left fade, which is what "the row opens on a whole pill" means.
 *
 * At progress p the row shows its questions from p of a copy in, so a pill
 * whose left edge sits at `pillStart` in the track reaches the viewport's
 * `fade` mark at (pillStart - fade) of a copy. The row's first pill starts
 * at zero and therefore opens just before the loop wraps, which is the frame
 * the design draws: the faded tail of the previous question under the
 * gradient, then a whole question.
 */
export function openingProgress(
  pillStart: number,
  fade: number,
  copyWidth: number
): number {
  if (!Number.isFinite(copyWidth) || copyWidth <= 0) return 0
  return wrapFraction((pillStart - fade) / copyWidth)
}

/**
 * The `scrollLeft` that shows exactly what the track shows at this progress.
 *
 * Both numbers describe the same row, so switching between them is invisible
 * as long as this is the conversion used in both directions. A progress of
 * one wraps to a scroll of zero rather than to one whole copy: the two show
 * the same pixels, because the second copy is the first one repeated, and
 * the smaller of them keeps the focusable pills at offsets the row can
 * actually scroll to.
 *
 * `inset` is the blank lead a held-still track is given (its start padding),
 * which moves every pill that far right. Without it a row's first pill
 * starts at scroll zero with nothing to its left, and no scroll could bring
 * it out from under the left fade.
 */
export function scrollLeftForProgress(
  progress: number,
  copyWidth: number,
  inset = 0
): number {
  if (!Number.isFinite(copyWidth) || copyWidth <= 0) return inset
  return wrapFraction(progress) * copyWidth + inset
}

/** The inverse: the progress a held-still row should resume from. */
export function progressForScrollLeft(
  scrollLeft: number,
  copyWidth: number,
  inset = 0
): number {
  if (!Number.isFinite(copyWidth) || copyWidth <= 0) return 0
  return wrapFraction((scrollLeft - inset) / copyWidth)
}

export interface RevealRequest {
  /** Where the row is scrolled to now. */
  scrollLeft: number
  /** The visible width of the row. */
  viewportWidth: number
  /** The focused pill's left edge, in the track's own coordinates. */
  pillStart: number
  pillWidth: number
  /**
   * The width of the edge fade. A pill parked under the gradient is half
   * invisible, so the pill is placed inside it rather than merely inside the
   * row.
   */
  fade: number
  /** The furthest the row can scroll. */
  maxScrollLeft: number
}

/**
 * Where the row has to scroll for a focused pill to be legible, moving as
 * little as possible.
 *
 * A pill already clear of both fades does not move the row at all, which
 * matters while tabbing along a row that is holding still: only the pills
 * that need it cause a jump. A pill too wide to clear both fades at once
 * (every long question at 390px) has its start placed at the left fade,
 * because the first words are the ones that identify it.
 */
export function revealScrollLeft({
  scrollLeft,
  viewportWidth,
  pillStart,
  pillWidth,
  fade,
  maxScrollLeft,
}: RevealRequest): number {
  const pillEnd = pillStart + pillWidth
  const visibleEnd = scrollLeft + viewportWidth - fade
  let next = scrollLeft
  if (pillEnd > visibleEnd) next = pillEnd - viewportWidth + fade
  // Second, so that a pill wider than the readable width lands start-first.
  if (pillStart < next + fade) next = pillStart - fade
  return clamp(next, 0, maxScrollLeft)
}

function clamp(value: number, low: number, high: number): number {
  if (high < low) return low
  return Math.min(Math.max(value, low), high)
}

/** A fraction of a loop, always in [0, 1). */
function wrapFraction(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 1) + 1) % 1
}
