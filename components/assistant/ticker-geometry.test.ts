import { describe, expect, test } from 'bun:test'
import { STARTER_QUESTIONS } from './copy'
import {
  ASK_START_AT,
  HOME_START_AT,
  loopSeconds,
  openingProgress,
  pillIndexFor,
  progressForScrollLeft,
  revealScrollLeft,
  scrollLeftForProgress,
  sidewaysWheelPixels,
  tickerRows,
  TICKER_SPEED_PX_PER_SECOND,
} from './ticker-geometry'

/**
 * The ticker's arithmetic, without a browser (MTC-39, MTC-55).
 *
 * The rows' own behaviour is proven on the preview. What can be proven here
 * is the part that is easy to get wrong and invisible when it is: the pool
 * has to reach both rows intact, and the two coordinate systems have to
 * agree, or a pill taking focus makes its row jump.
 */

const COPY_WIDTH = 12_000
const VIEWPORT = 704
const FADE = 72

describe('the loop duration', () => {
  test('holds one speed whatever a row costs', () => {
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

describe('splitting the pool across the rows', () => {
  const [first, second] = tickerRows(STARTER_QUESTIONS)

  test('row one takes the odd positions and row two the even ones, so the leading questions lead both rows', () => {
    // The pool is ordered by what the reader most wants answered, so a
    // first-half/second-half split would bury the lead questions at the back
    // of the second row. Positions count from one.
    expect(first[0]).toBe(STARTER_QUESTIONS[0])
    expect(first[1]).toBe(STARTER_QUESTIONS[2])
    expect(second[0]).toBe(STARTER_QUESTIONS[1])
    expect(second[1]).toBe(STARTER_QUESTIONS[3])
  })

  test('every question is in exactly one row, once', () => {
    const shown = [...first, ...second]
    expect(shown).toHaveLength(STARTER_QUESTIONS.length)
    expect(new Set(shown).size).toBe(STARTER_QUESTIONS.length)
    for (const question of STARTER_QUESTIONS) expect(shown).toContain(question)
  })

  test('each row keeps the pool order it inherited', () => {
    const pool: readonly string[] = STARTER_QUESTIONS
    for (const row of [first, second]) {
      const positions = row.map(question => pool.indexOf(question))
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  test('an odd pool leaves the rows one question apart', () => {
    const [odd, even] = tickerRows(['a', 'b', 'c', 'd', 'e'])
    expect(odd).toEqual(['a', 'c', 'e'])
    expect(even).toEqual(['b', 'd'])
  })

  test('an empty pool makes two empty rows rather than throwing', () => {
    expect(tickerRows([])).toEqual([[], []])
  })
})

describe('which pill a row opens on', () => {
  test('the surfaces open every row on different, whole pills', () => {
    // Indices, not fractions: a fraction of a track lands wherever the pill
    // widths put it, which is how a row opens on half a question. And /ask
    // must not open on what the homepage just showed, in either row.
    expect(Number.isInteger(HOME_START_AT)).toBe(true)
    expect(Number.isInteger(ASK_START_AT)).toBe(true)
    for (const row of tickerRows(STARTER_QUESTIONS)) {
      expect(pillIndexFor(ASK_START_AT, row.length)).not.toBe(
        pillIndexFor(HOME_START_AT, row.length)
      )
    }
  })

  test('an index past the end of a row wraps into it', () => {
    expect(pillIndexFor(14, 14)).toBe(0)
    expect(pillIndexFor(15, 14)).toBe(1)
    expect(pillIndexFor(-1, 14)).toBe(13)
  })

  test('a row with nothing in it has no pill to open on', () => {
    expect(pillIndexFor(4, 0)).toBe(0)
  })
})

describe('opening on a whole pill', () => {
  test('the pill it opens on starts at the inner edge of the left fade', () => {
    // The row shows its questions from `progress` of a copy in, so the pixel
    // the opening pill is parked at is exactly the fade.
    const pillStart = 3400
    const progress = openingProgress(pillStart, FADE, COPY_WIDTH)
    expect(scrollLeftForProgress(progress, COPY_WIDTH)).toBeCloseTo(
      pillStart - FADE,
      6
    )
  })

  test('a row opening on its first pill opens just before the loop wraps', () => {
    // Its first pill starts at zero with nothing to its left, so the fade is
    // covered by the tail of the copy before it. That is the frame the design
    // draws, and it is why there is a second copy at all.
    const progress = openingProgress(0, FADE, COPY_WIDTH)
    expect(progress).toBeCloseTo(1 - FADE / COPY_WIDTH, 6)
    expect(progress).toBeLessThan(1)
  })

  test('a row that has not been laid out opens at the start', () => {
    expect(openingProgress(0, FADE, 0)).toBe(0)
    expect(openingProgress(100, FADE, Number.NaN)).toBe(0)
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

  test('progress and scroll offset grow together', () => {
    // The keyframe travels leftwards, so later in the loop is further into
    // the questions. Reverse it and this pair inverts, which is what
    // lib/ticker-css.test.ts guards.
    expect(scrollLeftForProgress(0.25, COPY_WIDTH)).toBe(COPY_WIDTH * 0.25)
    expect(progressForScrollLeft(COPY_WIDTH * 0.25, COPY_WIDTH)).toBeCloseTo(
      0.25,
      6
    )
  })

  test('the start of the loop is a scroll of zero, not of one whole copy', () => {
    // Both show the same pixels, because the second copy is the first one
    // repeated. Zero is the one that keeps the real buttons reachable.
    expect(scrollLeftForProgress(0, COPY_WIDTH)).toBe(0)
    expect(scrollLeftForProgress(1, COPY_WIDTH)).toBe(0)
  })

  test('a scroll of one whole copy is the start of the loop again', () => {
    expect(progressForScrollLeft(COPY_WIDTH, COPY_WIDTH)).toBe(0)
  })

  test('a row scrolled into the second copy resumes inside the first', () => {
    const progress = progressForScrollLeft(COPY_WIDTH * 1.25, COPY_WIDTH)
    expect(progress).toBeGreaterThanOrEqual(0)
    expect(progress).toBeLessThan(1)
    expect(progress).toBeCloseTo(0.25, 6)
  })

  test('the lead a held track is given shifts the scroll and nothing else', () => {
    // Freezing adds the lead to the track and the same width to scrollLeft,
    // and the thaw takes it back off, so the row does not move either way.
    for (const progress of [0, 0.1, 0.5, 0.99]) {
      const scrollLeft = scrollLeftForProgress(progress, COPY_WIDTH, FADE)
      expect(scrollLeft).toBeCloseTo(progress * COPY_WIDTH + FADE, 6)
      expect(progressForScrollLeft(scrollLeft, COPY_WIDTH, FADE)).toBeCloseTo(
        progress,
        6
      )
    }
  })

  test('a held row scrolled back onto its lead resumes on its first pill', () => {
    // The first pill revealed at a scroll of zero sits at the fade, which is
    // the frame the row opens on when it opens on that pill.
    expect(progressForScrollLeft(0, COPY_WIDTH, FADE)).toBeCloseTo(
      openingProgress(0, FADE, COPY_WIDTH),
      6
    )
  })

  test('an unmeasured row resumes at the start rather than at infinity', () => {
    expect(progressForScrollLeft(400, 0)).toBe(0)
    expect(scrollLeftForProgress(0.5, 0)).toBe(0)
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

  test('a row’s first question clears the fade once the track has its lead', () => {
    // It starts at zero with nothing to its left, so without the lead a held
    // track is given, clearing the gradient would need a negative scroll.
    // With the lead the pill starts at the fade, and a scroll of zero shows
    // it whole.
    const withoutLead = revealScrollLeft({
      ...row,
      scrollLeft: 0,
      pillStart: 0,
      pillWidth: 275,
    })
    // On screen a pill starts at pillStart - scrollLeft.
    expect(0 - withoutLead).toBeLessThan(FADE)
    const withLead = revealScrollLeft({
      ...row,
      scrollLeft: 4000,
      pillStart: FADE,
      pillWidth: 275,
    })
    expect(FADE - withLead).toBeGreaterThanOrEqual(FADE)
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

describe('how far a wheel event moves a handed-over row', () => {
  const LINE = 16
  const PAGE = 358
  const motion = (
    deltaX: number,
    deltaY: number,
    { deltaMode = 0, shiftKey = false } = {}
  ) => ({ deltaX, deltaY, deltaMode, shiftKey })

  test('a mostly sideways gesture moves the row by its sideways delta', () => {
    expect(sidewaysWheelPixels(motion(40, 3), LINE, PAGE)).toBe(40)
    expect(sidewaysWheelPixels(motion(-25, 10), LINE, PAGE)).toBe(-25)
  })

  test('a mostly upright gesture is the page being scrolled, and moves nothing', () => {
    expect(sidewaysWheelPixels(motion(2, 60), LINE, PAGE)).toBe(0)
    // A tie is not a request to read along the row either.
    expect(sidewaysWheelPixels(motion(20, 20), LINE, PAGE)).toBe(0)
  })

  test('shift with an upright wheel reads as sideways', () => {
    expect(
      sidewaysWheelPixels(motion(0, 50, { shiftKey: true }), LINE, PAGE)
    ).toBe(50)
  })

  test('lines and pages become pixels', () => {
    expect(
      sidewaysWheelPixels(motion(3, 0, { deltaMode: 1 }), LINE, PAGE)
    ).toBe(48)
    expect(
      sidewaysWheelPixels(motion(1, 0, { deltaMode: 2 }), LINE, PAGE)
    ).toBe(PAGE)
  })
})
