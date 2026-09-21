/**
 * The arithmetic behind the starter-question ticker (MTC-39).
 *
 * The row is one track holding the question pool twice, moved by a CSS
 * `transform` keyframe that travels exactly one copy's width. Two coordinate
 * systems therefore describe the same row, and the component swaps between
 * them whenever a pill takes focus:
 *
 * - **animation progress**, a fraction of one loop, which is what the CSS
 *   animation and its negative `animation-delay` speak;
 * - **scroll offset**, pixels of `scrollLeft`, which is what a browser moves
 *   to bring a focused element into view.
 *
 * Everything that converts between them, or decides where a focused pill
 * should sit, is here: it is pure, so it is tested without a DOM, and the
 * component is left with nothing but the event plumbing.
 */

/**
 * How fast the row drifts. Slow enough to read a pill that is already on
 * screen, quick enough that a different question arrives while someone is
 * deciding: a pill crosses a 640px row in about eighteen seconds.
 */
export const TICKER_SPEED_PX_PER_SECOND = 35

/** How long a touch holds the row still before it drifts again. */
export const TOUCH_PAUSE_MS = 4000

/**
 * How many times the pool is laid down in the track.
 *
 * It is here rather than in the component because the keyframe encodes the
 * same number: the track travels `100 / TICKER_COPIES` percent of its own
 * width, which equals one copy only while these two agree. ticker-css.test.ts
 * fails if the stylesheet and this constant ever drift apart.
 */
export const TICKER_COPIES = 2

/** The keyframe this arithmetic describes. Must match app/globals.css. */
export const TICKER_ANIMATION_NAME = 'starter-ticker'

/** The keyframe's starting transform, which is why every conversion inverts. */
export const TICKER_KEYFRAME_FROM = `translateX(-${100 / TICKER_COPIES}%)`

/**
 * Where each surface opens the loop, as a fraction of the pool.
 *
 * The homepage starts at the top. A visitor who submits from there lands on
 * /ask a second later, and a row that opened on the same three pills would
 * look like it had not moved. Both are named so that changing one is an edit
 * in the same place as the other.
 */
export const HOME_START_AT = 0
export const ASK_START_AT = 1 / 3

/**
 * Seconds for one loop at the ticker's speed, given the width of one copy of
 * the pool. Zero width means the row has not been laid out yet; the caller
 * leaves the stylesheet's fallback in place rather than dividing by it.
 */
export function loopSeconds(copyWidth: number): number | null {
  if (!Number.isFinite(copyWidth) || copyWidth <= 0) return null
  return copyWidth / TICKER_SPEED_PX_PER_SECOND
}

/**
 * The animation progress that opens the loop `startAt` of the way into the
 * pool.
 *
 * The keyframe runs from TICKER_KEYFRAME_FROM to `translateX(0)`, so the
 * content at the left edge is *earlier* in the pool as progress grows: a
 * progress of p shows the pool from (1 - p) of the way in. Inverting here is
 * what lets the surfaces name the thing they care about, which is how far
 * into the questions their row opens. Reverse that keyframe and every
 * conversion below is mirrored, which is why ticker-css.test.ts pins it.
 */
export function offsetForStartAt(startAt: number): number {
  return wrapFraction(1 - startAt)
}

/**
 * The `scrollLeft` that shows exactly what the track shows at this progress.
 *
 * Both numbers describe the same row, so switching between them is invisible
 * as long as this is the conversion used in both directions. A progress of
 * zero wraps to a scroll of zero rather than to one whole copy: the two show
 * the same pixels, because the second copy is the first one repeated, and
 * the smaller of them keeps the focusable pills at offsets the row can
 * actually scroll to.
 */
export function scrollLeftForProgress(
  progress: number,
  copyWidth: number
): number {
  return wrapFraction(1 - progress) * copyWidth
}

/** The inverse: the progress a paused row should resume from. */
export function progressForScrollLeft(
  scrollLeft: number,
  copyWidth: number
): number {
  if (!Number.isFinite(copyWidth) || copyWidth <= 0) return 0
  return wrapFraction(1 - (scrollLeft % copyWidth) / copyWidth)
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
