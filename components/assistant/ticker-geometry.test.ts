import { describe, expect, test } from 'bun:test'
import {
  ASK_START_AT,
  loopSeconds,
  offsetForStartAt,
  progressForScrollLeft,
  revealScrollLeft,
  scrollLeftForProgress,
  TICKER_SPEED_PX_PER_SECOND,
} from './ticker-geometry'

/**
 * The ticker's arithmetic, without a browser (MTC-39).
 *
 * There is no component-test infrastructure in this repo, so the row's own
 * behaviour is proven on the preview. What can be proven here is the part
 * that is easy to get wrong and invisible when it is: the two coordinate
 * systems have to agree, or a pill taking focus makes the row jump.
 */

const COPY_WIDTH = 12_000
const VIEWPORT = 704
const FADE = 72

describe('the loop duration', () => {
  test('holds one speed whatever the pool costs', () => {
    expect(loopSeconds(3500)).toBe(100)
    expect(loopSeconds(COPY_WIDTH)).toBe(
      COPY_WIDTH / TICKER_SPEED_PX_PER_SECOND
    )
  })

  test('refuses a width the row has not been laid out at', () => {
    expect(loopSeconds(0)).toBeNull()
    expect(loopSeconds(-10)).toBeNull()
    expect(loopSeconds(Number.NaN)).toBeNull()
  })
})

describe('where a row opens', () => {
  test('the top of the pool is the start of the loop', () => {
    expect(offsetForStartAt(0)).toBe(0)
  })

  test('/ask opens further in than the homepage', () => {
    expect(offsetForStartAt(ASK_START_AT)).not.toBe(offsetForStartAt(0))
  })

  test('opening a third of the way in shows the pool from a third in', () => {
    const offset = offsetForStartAt(1 / 3)
    expect(scrollLeftForProgress(offset, COPY_WIDTH)).toBeCloseTo(
      COPY_WIDTH / 3,
      6
    )
  })

  test('a fraction past the end of the pool wraps into it', () => {
    expect(offsetForStartAt(1)).toBe(0)
    expect(offsetForStartAt(1.25)).toBeCloseTo(offsetForStartAt(0.25), 6)
  })
})

describe('the two coordinate systems', () => {
  test('a scroll offset and the progress it came from describe one row', () => {
    for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.99]) {
      const scrollLeft = scrollLeftForProgress(progress, COPY_WIDTH)
      expect(progressForScrollLeft(scrollLeft, COPY_WIDTH)).toBeCloseTo(
        progress,
        6
      )
    }
  })

  test('the start of the loop is a scroll of zero, not of one whole copy', () => {
    // Both show the same pixels, because the second copy is the first one
    // repeated. Zero is the one that keeps the real buttons reachable.
    expect(scrollLeftForProgress(0, COPY_WIDTH)).toBe(0)
  })

  test('a scroll of one whole copy is the start of the loop again', () => {
    expect(progressForScrollLeft(COPY_WIDTH, COPY_WIDTH)).toBe(0)
  })

  test('a row scrolled into the second copy resumes inside the first', () => {
    const progress = progressForScrollLeft(COPY_WIDTH * 1.25, COPY_WIDTH)
    expect(progress).toBeGreaterThanOrEqual(0)
    expect(progress).toBeLessThan(1)
    expect(progress).toBeCloseTo(0.75, 6)
  })

  test('an unmeasured row resumes at the start rather than at infinity', () => {
    expect(progressForScrollLeft(400, 0)).toBe(0)
  })
})

describe('bringing a focused pill into view', () => {
  const row = {
    viewportWidth: VIEWPORT,
    fade: FADE,
    maxScrollLeft: COPY_WIDTH,
  }

  test('leaves the row alone when the pill is already clear of both fades', () => {
    expect(
      revealScrollLeft({
        ...row,
        scrollLeft: 0,
        pillStart: 100,
        pillWidth: 200,
      })
    ).toBe(0)
  })

  test('scrolls the least it can to reach a pill off the right edge', () => {
    const next = revealScrollLeft({
      ...row,
      scrollLeft: 0,
      pillStart: 1000,
      pillWidth: 200,
    })
    expect(next).toBe(1000 + 200 - VIEWPORT + FADE)
    // The pill ends exactly at the inner edge of the right fade.
    expect(next + VIEWPORT - FADE).toBe(1200)
  })

  test('scrolls back for a pill off the left edge', () => {
    const next = revealScrollLeft({
      ...row,
      scrollLeft: 500,
      pillStart: 100,
      pillWidth: 200,
    })
    expect(next).toBe(100 - FADE)
  })

  test('a pill under the fade is not counted as visible', () => {
    // Its left edge is inside the row but inside the gradient, where half of
    // it is faded out.
    const next = revealScrollLeft({
      ...row,
      scrollLeft: 0,
      pillStart: 40,
      pillWidth: 200,
    })
    expect(next).toBe(0)
    expect(
      revealScrollLeft({
        ...row,
        scrollLeft: 300,
        pillStart: 340,
        pillWidth: 200,
      })
    ).toBe(340 - FADE)
  })

  test('a pill too wide for the row is shown from its first words', () => {
    // Every long question at 390px. Both edges cannot be satisfied, and the
    // start is the half that identifies the question.
    const narrow = { viewportWidth: 358, fade: 56, maxScrollLeft: COPY_WIDTH }
    const next = revealScrollLeft({
      ...narrow,
      scrollLeft: 0,
      pillStart: 900,
      pillWidth: 559,
    })
    expect(next).toBe(900 - 56)
  })

  test('never scrolls past either end of the track', () => {
    expect(
      revealScrollLeft({ ...row, scrollLeft: 0, pillStart: 10, pillWidth: 100 })
    ).toBe(0)
    expect(
      revealScrollLeft({
        ...row,
        scrollLeft: COPY_WIDTH,
        pillStart: COPY_WIDTH + 5000,
        pillWidth: 200,
        maxScrollLeft: COPY_WIDTH,
      })
    ).toBe(COPY_WIDTH)
  })
})
