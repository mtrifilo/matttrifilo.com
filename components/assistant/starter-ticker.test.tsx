import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { cssBlock } from '@/test/css-block'
import { STARTER_QUESTIONS } from './copy'
import { StarterTicker } from './starter-ticker'
import {
  EDGE_FADE_PROPERTY,
  revealScrollLeft,
  TICKER_ANIMATION_NAME,
  TICKER_COPIES,
  tickerRows,
  WHEEL_GESTURE_GAP_MS,
} from './ticker-geometry'

/**
 * The starter ticker's two rows as they are rendered (MTC-55, MTC-75).
 *
 * The rows' arithmetic is tested in ticker-geometry.test.ts and their
 * contract with the stylesheet in lib/ticker-css.test.ts. What neither can
 * see is the markup: which row each question lands in, how many copies of a
 * row exist, which of them a screen reader and the tab key meet, and which
 * state the component itself writes for the stylesheet to read.
 *
 * Nothing here asserts motion. Happy DOM runs no animations and lays nothing
 * out, so every pill measures zero wide; the speed, the pause, the feel of a
 * drag and its momentum are preview checks. Where a behaviour only starts
 * once a row is moving, the test states a running loop and a measured width
 * itself. The hand-over tests go one step further and state a layout too
 * (pill offsets, and the stylesheet's own fade and lead), because "the same
 * pill is at the edge before and after" is the whole of what they prove.
 */

const [FIRST_ROW, SECOND_ROW] = tickerRows(STARTER_QUESTIONS)

/** The part of Happy DOM's window that describes the visitor's device. */
const device = (
  window as unknown as {
    happyDOM: { settings: { device: { prefersReducedMotion: string } } }
  }
).happyDOM.settings.device

/**
 * Set the visitor's motion preference.
 *
 * Happy DOM's `matchMedia` evaluates queries against its device settings,
 * whose default is no preference, so a visitor who asked for less motion is
 * stated here rather than by replacing `matchMedia`.
 */
function setReducedMotion(reduce: boolean): void {
  device.prefersReducedMotion = reduce ? 'reduce' : 'no-preference'
}

afterEach(() => {
  setReducedMotion(false)
})

/**
 * The group the stylesheet's hover and focus rules are anchored on,
 * and the two rows inside it, each with the track it moves.
 */
function tickerOf(container: HTMLElement) {
  const group = container.querySelector<HTMLElement>('.starter-ticker')
  const rows = [
    ...container.querySelectorAll<HTMLElement>('.starter-ticker-row'),
  ].map(viewport => {
    const track = viewport.querySelector<HTMLElement>('.starter-ticker-track')
    if (!track) throw new Error('a ticker row rendered no track')
    return { viewport, track }
  })
  if (!group) throw new Error('the ticker rendered no group')
  return { group, rows }
}

/** The pill labels of one row, every copy, in the order the markup has them. */
function pillTexts(viewport: HTMLElement): string[] {
  return [...viewport.querySelectorAll('button')].map(
    pill => pill.textContent ?? ''
  )
}

describe('the questions the ticker offers', () => {
  test('lays the pool out as two rows, each repeated TICKER_COPIES times', () => {
    // The keyframe travels 100 / TICKER_COPIES percent of a track, which is
    // one copy only while each row renders exactly that many.
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { rows } = tickerOf(container)

    expect(rows).toHaveLength(2)
    for (const { track } of rows) {
      expect(track.querySelectorAll('.starter-ticker-copy')).toHaveLength(
        TICKER_COPIES
      )
    }
  })

  test('puts the odd questions in the first row and the even ones in the second', () => {
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const [first, second] = tickerOf(container).rows

    const copiesOf = (row: readonly string[]) =>
      Array.from({ length: TICKER_COPIES }, () => row).flat()
    expect(pillTexts(first.viewport)).toEqual(copiesOf(FIRST_ROW))
    expect(pillTexts(second.viewport)).toEqual(copiesOf(SECOND_ROW))
  })

  test('announces every question in the pool exactly once', () => {
    render(<StarterTicker onPick={() => {}} />)

    // By role, so this counts what a screen reader and the tab key reach:
    // the trailing copies are aria-hidden and are not in the tree. A copy
    // that lost its aria-hidden would read as the pool said twice, which is
    // the failure no other test here would notice.
    const announced = screen
      .getAllByRole('button')
      .map(pill => pill.textContent)
    expect(announced).toEqual([...FIRST_ROW, ...SECOND_ROW])
    expect(new Set(announced)).toEqual(new Set(STARTER_QUESTIONS))
  })

  test('every announced pill is a real, focusable button', () => {
    render(<StarterTicker onPick={() => {}} />)

    for (const pill of screen.getAllByRole('button')) {
      expect(pill.tagName).toBe('BUTTON')
      expect(pill.hasAttribute('disabled')).toBe(false)
      // The trailing copies carry tabIndex -1; an announced pill must not,
      // or the row would be announced and unreachable.
      expect(pill.getAttribute('tabindex')).toBeNull()
    }
  })

  test('silences every copy of a row but the first', () => {
    // One that were focusable would double the tab stops before the
    // composer.
    const { container } = render(<StarterTicker onPick={() => {}} />)

    for (const { track } of tickerOf(container).rows) {
      const copies = [...track.querySelectorAll('.starter-ticker-copy')]
      expect(copies[0].hasAttribute('aria-hidden')).toBe(false)
      for (const copy of copies.slice(1)) {
        expect(copy.getAttribute('aria-hidden')).toBe('true')
        for (const pill of copy.querySelectorAll('button')) {
          expect(pill.getAttribute('tabindex')).toBe('-1')
        }
      }
    }
  })

  test('a pill in a silent copy still asks its question', () => {
    // The trailing copy is what a row shows while its loop wraps, so it is
    // under the cursor for much of every loop. Hidden from assistive tech,
    // never dead to a click.
    const picked: string[] = []
    const { container } = render(<StarterTicker onPick={q => picked.push(q)} />)
    const [first] = tickerOf(container).rows

    const pill = first.track
      .querySelector('.starter-ticker-copy[aria-hidden="true"]')
      ?.querySelector('button')
    if (!pill) throw new Error('the silent copy rendered no pills')

    fireEvent.click(pill)
    expect(picked).toEqual([FIRST_ROW[0]])
  })

  test('names the rows once, as one group', () => {
    render(<StarterTicker onPick={() => {}} />)

    // One group in all: a row wrapped in a group of its own would be one
    // more landmark for a screen reader to announce before the questions.
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(
      screen.getAllByRole('group', { name: 'Starter questions' })
    ).toHaveLength(1)
  })

  test('each row wears the class that carries the shared edge fade', () => {
    // Without it a row loses its gradient and parks a focused pill under the
    // edge, and no other check here would notice.
    const { container } = render(<StarterTicker onPick={() => {}} />)

    for (const { viewport } of tickerOf(container).rows) {
      expect(viewport.classList.contains('edge-faded-row')).toBe(true)
    }
  })
})

const GLOBALS_CSS = readFileSync(
  new URL('../../app/globals.css', import.meta.url),
  'utf8'
)

const COPY_WIDTH_MEASURED = 600
const REAL_BOUNDING_RECT = Element.prototype.getBoundingClientRect

afterEach(() => {
  Element.prototype.getBoundingClientRect = REAL_BOUNDING_RECT
})

/** A running loop at the given progress, as the browser would report it. */
function runningLoop(progress: number): Animation {
  return {
    animationName: TICKER_ANIMATION_NAME,
    effect: { getComputedTiming: () => ({ progress }) },
  } as unknown as Animation
}

/**
 * Render rows that believe they are moving.
 *
 * Each row measures one copy of its questions when it mounts, and only a
 * row with a measured width and a running loop has a position to hand
 * over, so both are stated: the copy's width before the render, and the
 * browser's animation on each track after it.
 */
function renderMovingRows({
  copyWidth = COPY_WIDTH_MEASURED,
  progress = 0.25,
}: { copyWidth?: number; progress?: number } = {}) {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const rect = REAL_BOUNDING_RECT.call(this)
    if (!this.classList.contains('starter-ticker-copy')) return rect
    return { ...rect.toJSON(), width: copyWidth } as DOMRect
  }
  const { container } = render(<StarterTicker onPick={() => {}} />)
  const { rows } = tickerOf(container)
  for (const { track } of rows) {
    track.getAnimations = () => [runningLoop(progress)]
  }
  return rows
}

/** The announced pills of one row, in tab order. */
function announcedPills(viewport: HTMLElement): HTMLElement[] {
  return [
    ...viewport.querySelectorAll<HTMLElement>(
      '.starter-ticker-copy:not([aria-hidden]) button'
    ),
  ]
}

describe('a moving row, while a pill has focus', () => {
  test('a focused pill leaves a moving row that has not been measured alone', () => {
    // A loop is running but the copy has no width yet (the first frames, or
    // before the font loads), so the loop's position cannot be converted
    // into a scroll offset; freezing anyway would move the row wrongly. The
    // width is left at Happy DOM's zero on purpose: this is the width
    // guard, not the no-loop guard tested below.
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { rows } = tickerOf(container)
    for (const { track } of rows)
      track.getAnimations = () => [runningLoop(0.25)]

    screen.getAllByRole('button')[0].focus()
    expect(rows[0].track.dataset.frozen).toBeUndefined()
  })

  test('freezes the row holding focus, and only that row', () => {
    // Only the focused row has a pill to scroll into view; the other keeps
    // its loop, paused by the stylesheet's focus-within rule rather than by
    // a freeze.
    const [first, second] = renderMovingRows()

    announcedPills(first.viewport)[0].focus()
    expect(first.track.dataset.frozen).toBe('true')
    expect(second.track.dataset.frozen).toBeUndefined()
  })

  test('stays frozen while focus moves from one pill to the next', () => {
    // Thawing between two pills would restart the loop under a visitor who
    // is tabbing along the row. The row is held at its scroll offset, so the
    // end state alone cannot tell; what is checked is that the flag was
    // never taken off on the way.
    const [first] = renderMovingRows()
    const [one, two] = announcedPills(first.viewport)
    one.focus()

    const flagChanges = new MutationObserver(() => {})
    flagChanges.observe(first.track, { attributeFilter: ['data-frozen'] })
    two.focus()
    const changes = flagChanges.takeRecords()
    flagChanges.disconnect()

    expect(changes).toHaveLength(0)
    expect(first.track.dataset.frozen).toBe('true')
  })

  test('hands the freeze over when focus moves to the other row', () => {
    const [first, second] = renderMovingRows()

    announcedPills(first.viewport).at(-1)?.focus()
    announcedPills(second.viewport)[0].focus()
    expect(first.track.dataset.frozen).toBeUndefined()
    expect(second.track.dataset.frozen).toBe('true')
  })

  test('leaves a measured row alone when its loop is not running', () => {
    // The freeze exists to hand a moving track's position over to
    // scrollLeft. With no animation running there is no transform to
    // replace, and writing the flag anyway would drop an animation that a
    // browser had not started yet.
    const [first] = renderMovingRows()
    first.track.getAnimations = () => []

    announcedPills(first.viewport)[0].focus()
    expect(first.track.dataset.frozen).toBeUndefined()
  })

  test('leaves the row alone for a visitor who asked for no motion', () => {
    // Under reduced motion the row is an ordinary scroll container and the
    // browser scrolls a focused pill into view itself.
    setReducedMotion(true)
    const [first] = renderMovingRows()

    announcedPills(first.viewport)[0].focus()
    expect(first.track.dataset.frozen).toBeUndefined()
  })

  test('thaws once focus leaves the rows', () => {
    const [first] = renderMovingRows()

    announcedPills(first.viewport)[0].focus()
    ;(document.activeElement as HTMLElement).blur()
    expect(first.track.dataset.frozen).toBeUndefined()
  })
})

describe('a row handed over to the visitor by touch or wheel', () => {
  /**
   * The stylesheet's own declarations for the fade, the freeze's lead and
   * the handed-over strip, so the lead the component reads back is the one
   * app/globals.css declares rather than a number this file made up.
   */
  const TICKER_RULES = [
    '.edge-faded-row {',
    ".starter-ticker-track[data-frozen='true'] {",
    ".starter-ticker-row[data-handed-over='true'] {",
    ".starter-ticker-row[data-handed-over='true'] .starter-ticker-track {",
  ]

  /** Every pill in a row is this wide, gap included, so a copy's width is known. */
  const PILL_PITCH = 208
  const PILL_WIDTH = 200
  const VIEWPORT_WIDTH = 358

  let stylesheet: HTMLStyleElement | undefined

  afterEach(() => {
    stylesheet?.remove()
    stylesheet = undefined
  })

  /**
   * Moving rows laid out the way a browser would lay them out: every pill
   * the same pitch, both copies end to end, and the freeze's lead pushing
   * every pill right while the track is frozen. Happy DOM lays nothing out,
   * so these offsets are what give "the pill at the left edge" a meaning.
   */
  function renderLaidOutRows(progress = 0.25) {
    stylesheet = document.createElement('style')
    stylesheet.textContent = TICKER_RULES.map(rule =>
      cssBlock(GLOBALS_CSS, rule)
    ).join('\n')
    document.head.append(stylesheet)

    const copyWidth = FIRST_ROW.length * PILL_PITCH
    const rows = renderMovingRows({ copyWidth, progress })
    for (const { viewport, track } of rows) {
      const pills = [...track.querySelectorAll<HTMLElement>('button')]
      pills.forEach((pill, index) => {
        Object.defineProperty(pill, 'offsetLeft', {
          get: () => index * PILL_PITCH + leadOf(track),
        })
        Object.defineProperty(pill, 'offsetWidth', { get: () => PILL_WIDTH })
      })
      Object.defineProperty(viewport, 'clientWidth', {
        get: () => VIEWPORT_WIDTH,
      })
      Object.defineProperty(viewport, 'scrollWidth', {
        get: () => pills.length * PILL_PITCH + leadOf(track),
      })
    }
    return { rows, copyWidth }
  }

  function leadOf(track: HTMLElement): number {
    return Number.parseFloat(getComputedStyle(track).paddingInlineStart) || 0
  }

  /**
   * The index of the pill at the row's left edge, counting both copies.
   *
   * While the loop runs, the track is translated left by the loop's progress
   * of one copy, so the track coordinate at the row's edge is that distance.
   * Once the row is frozen the transform is gone, and the coordinate at the
   * edge is scrollLeft, in a track whose pills the lead has moved right.
   */
  function pillAtLeftEdge(track: HTMLElement, edge: number): number {
    const pills = [...track.querySelectorAll<HTMLElement>('button')]
    return pills.findIndex(
      pill => pill.offsetLeft <= edge && edge < pill.offsetLeft + PILL_PITCH
    )
  }

  function isHandedOver(viewport: HTMLElement): boolean {
    return viewport.dataset.handedOver === 'true'
  }

  test('reads the lead off the stylesheet it is about to rely on', () => {
    // The position tests below are only as good as this: with no lead the
    // conversion is tested with half its terms at zero.
    const { rows } = renderLaidOutRows()
    rows[0].track.dataset.frozen = 'true'
    expect(leadOf(rows[0].track)).toBeGreaterThan(0)
  })

  test('a tap on a moving row still asks its question after the hand-over', () => {
    // The touch hands the row over before the click lands, and the pill
    // stays under the finger while the track freezes; a hand-over that
    // cancelled the touch or moved the row would swallow the tap. Nothing
    // else here fires a touch and a click on the same pill.
    const picked: string[] = []
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = REAL_BOUNDING_RECT.call(this)
      if (!this.classList.contains('starter-ticker-copy')) return rect
      return { ...rect.toJSON(), width: COPY_WIDTH_MEASURED } as DOMRect
    }
    const { container } = render(<StarterTicker onPick={q => picked.push(q)} />)
    const { rows } = tickerOf(container)
    for (const { track } of rows)
      track.getAnimations = () => [runningLoop(0.25)]
    const [first] = rows
    const pill = announcedPills(first.viewport)[0]

    const notCancelled = fireEvent.touchStart(pill)
    fireEvent.click(pill)

    expect(notCancelled).toBe(true)
    expect(isHandedOver(first.viewport)).toBe(true)
    expect(picked).toEqual([FIRST_ROW[0]])
  })

  test('a touch stops the touched row where it was, as a scroll strip', () => {
    const progress = 0.27
    const { rows, copyWidth } = renderLaidOutRows(progress)
    const [first] = rows
    const before = pillAtLeftEdge(first.track, progress * copyWidth)

    fireEvent.touchStart(announcedPills(first.viewport)[0])

    expect(isHandedOver(first.viewport)).toBe(true)
    expect(first.track.dataset.frozen).toBe('true')
    // The same pill is at the edge before and after, and it is part way
    // through the pool, so a hand-over that dropped the position (or the
    // lead) would land on a different one.
    expect(before).toBeGreaterThan(0)
    expect(pillAtLeftEdge(first.track, first.viewport.scrollLeft)).toBe(before)
    expect(first.viewport.scrollLeft).toBe(
      progress * copyWidth + leadOf(first.track)
    )
  })

  /**
   * A wheel event at a stated time. The gesture rule reads `timeStamp`,
   * which an event is given when it is made and cannot be passed in.
   */
  function wheelAt(
    target: HTMLElement,
    timeStamp: number,
    init: WheelEventInit
  ): boolean {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ...init,
    })
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    // Happy DOM's WheelEvent is not a MouseEvent, as a browser's is, and
    // drops the modifier keys it is given.
    Object.defineProperty(event, 'shiftKey', { value: init.shiftKey ?? false })
    return target.dispatchEvent(event)
  }

  test('a sideways wheel does the same hand-over, and moves the strip by its own delta', () => {
    const progress = 0.61
    const { rows, copyWidth } = renderLaidOutRows(progress)
    const [first] = rows
    const before = pillAtLeftEdge(first.track, progress * copyWidth)

    const notCancelled = wheelAt(first.viewport, 1000, {
      deltaX: 40,
      deltaY: 3,
    })

    expect(isHandedOver(first.viewport)).toBe(true)
    // Cancelled, and applied here instead: the browser may already have
    // given the gesture to the page.
    expect(notCancelled).toBe(false)
    expect(first.viewport.scrollLeft).toBeCloseTo(
      progress * copyWidth + leadOf(first.track) + 40
    )
    // The hand-over itself kept the pill at the edge where it was.
    expect(pillAtLeftEdge(first.track, first.viewport.scrollLeft - 40)).toBe(
      before
    )
  })

  test('the rest of that gesture scrolls the strip too, then the browser scrolls it', () => {
    const { rows } = renderLaidOutRows()
    const [first] = rows
    wheelAt(first.viewport, 1000, { deltaX: 40, deltaY: 0 })
    const handedOverAt = first.viewport.scrollLeft

    // Momentum: close together, and not only sideways.
    expect(wheelAt(first.viewport, 1016, { deltaX: 25, deltaY: 1 })).toBe(false)
    expect(wheelAt(first.viewport, 1032, { deltaX: 10, deltaY: 0 })).toBe(false)
    expect(first.viewport.scrollLeft).toBeCloseTo(handedOverAt + 35)

    // A new gesture begins over a strip that can scroll: left to the
    // browser, which here means not cancelled and not moved by hand.
    const later = 1032 + WHEEL_GESTURE_GAP_MS + 1
    expect(wheelAt(first.viewport, later, { deltaX: 40, deltaY: 0 })).toBe(true)
    expect(wheelAt(first.viewport, later + 16, { deltaX: 40, deltaY: 0 })).toBe(
      true
    )
    expect(first.viewport.scrollLeft).toBeCloseTo(handedOverAt + 35)
  })

  test('an upright stretch inside that gesture does not end it', () => {
    // Each event is closer to the last than the gap, but the sideways ones
    // are further apart than it: only the upright ones between them keep
    // the gesture the row's.
    const { rows } = renderLaidOutRows()
    const [first] = rows
    const step = WHEEL_GESTURE_GAP_MS - 1
    wheelAt(first.viewport, 1000, { deltaX: 40, deltaY: 0 })
    wheelAt(first.viewport, 1000 + step, { deltaX: 0, deltaY: 30 })
    wheelAt(first.viewport, 1000 + 2 * step, { deltaX: 0, deltaY: 30 })

    expect(
      wheelAt(first.viewport, 1000 + 3 * step, { deltaX: 20, deltaY: 0 })
    ).toBe(false)
  })

  test('an event the browser will not let go of is left to the browser', () => {
    // It is scrolling that one itself, so moving the strip too would move it
    // twice. The row is still handed over at the loop's position.
    const progress = 0.4
    const { rows, copyWidth } = renderLaidOutRows(progress)
    const [first] = rows
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: false,
      deltaX: 40,
    })
    first.viewport.dispatchEvent(event)

    expect(isHandedOver(first.viewport)).toBe(true)
    expect(first.viewport.scrollLeft).toBeCloseTo(
      progress * copyWidth + leadOf(first.track)
    )
  })

  test('shift with an upright wheel counts as sideways', () => {
    const { rows } = renderLaidOutRows()
    const [first] = rows

    wheelAt(first.viewport, 1000, { deltaX: 0, deltaY: 50, shiftKey: true })
    expect(isHandedOver(first.viewport)).toBe(true)
  })

  test('an upright wheel is the page being scrolled, and leaves the row moving', () => {
    const { rows } = renderLaidOutRows()
    const [first] = rows

    const scrolledNatively = fireEvent.wheel(first.viewport, {
      deltaX: 2,
      deltaY: 60,
    })

    expect(scrolledNatively).toBe(true)
    expect(isHandedOver(first.viewport)).toBe(false)
    expect(first.track.dataset.frozen).toBeUndefined()
  })

  test('the other row keeps moving until it is touched itself', () => {
    const { rows } = renderLaidOutRows()
    const [first, second] = rows

    fireEvent.touchStart(first.viewport)
    expect(isHandedOver(second.viewport)).toBe(false)
    expect(second.track.dataset.frozen).toBeUndefined()

    fireEvent.touchStart(second.viewport)
    expect(isHandedOver(second.viewport)).toBe(true)
  })

  /**
   * Scroll a row before its first placement, then place it. A row measures
   * zero wide until its copy has a width, so the scroll lands first, and
   * a new `startAt` is what makes it measure again.
   */
  function scrollThenPlace(scrolledTo: number) {
    const { container, rerender } = render(
      <StarterTicker onPick={() => {}} startAt={0} />
    )
    const [first] = tickerOf(container).rows
    first.viewport.scrollLeft = scrolledTo
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = REAL_BOUNDING_RECT.call(this)
      if (!this.classList.contains('starter-ticker-copy')) return rect
      return { ...rect.toJSON(), width: COPY_WIDTH_MEASURED } as DOMRect
    }
    rerender(<StarterTicker onPick={() => {}} startAt={1} />)
    return first
  }

  test('a moving row opens at scroll zero even if a finger scrolled it first', () => {
    // Under a coarse pointer a moving row is a scroll container from the
    // first paint, so a drag before the script runs can leave it scrolled;
    // the opening is computed for scroll zero.
    const first = scrollThenPlace(300)
    expect(first.track.dataset.placed).toBe('true')
    expect(first.viewport.scrollLeft).toBe(0)
  })

  test('a static strip keeps the scroll its visitor gave it', () => {
    setReducedMotion(true)
    const first = scrollThenPlace(300)
    expect(first.viewport.scrollLeft).toBe(300)
  })

  test('a row whose width is not measured yet is left moving', () => {
    // Converting the loop by a zero width would park the row at its start.
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { rows } = tickerOf(container)
    for (const { track } of rows) track.getAnimations = () => [runningLoop(0.4)]

    fireEvent.touchStart(rows[0].viewport)
    expect(isHandedOver(rows[0].viewport)).toBe(false)
    expect(rows[0].track.dataset.frozen).toBeUndefined()
  })

  describe('never resumes', () => {
    test('losing focus leaves a handed-over row frozen', () => {
      // The focus path thaws a row on blur; a row handed over to the visitor
      // must not come back to life because a pill in it lost focus.
      const { rows } = renderLaidOutRows()
      const [first] = rows
      fireEvent.touchStart(first.viewport)
      announcedPills(first.viewport)[0].focus()
      ;(document.activeElement as HTMLElement).blur()

      expect(first.track.dataset.frozen).toBe('true')
      expect(isHandedOver(first.viewport)).toBe(true)
    })

    test('a later touch or wheel does not move a row the visitor has scrolled', () => {
      const { rows } = renderLaidOutRows()
      const [first] = rows
      fireEvent.touchStart(first.viewport)
      first.viewport.scrollLeft = 1234

      fireEvent.touchStart(first.viewport)
      fireEvent.wheel(first.viewport, { deltaX: 30, deltaY: 0 })
      expect(first.viewport.scrollLeft).toBe(1234)
    })

    test('no timer is set that could start the row again', () => {
      const { rows } = renderLaidOutRows()
      const timers = spyOn(globalThis, 'setTimeout')
      try {
        fireEvent.touchStart(rows[0].viewport)
        fireEvent.wheel(rows[1].viewport, { deltaX: 30, deltaY: 0 })
        expect(timers).not.toHaveBeenCalled()
      } finally {
        timers.mockRestore()
      }
    })
  })

  test('a keyboard focus in a handed-over row reveals the pill from where the visitor left it', () => {
    // The row is not converted again: it is already a strip, and the reveal
    // moves it only as far as the pill needs to clear the fades.
    const { rows } = renderLaidOutRows()
    const [first] = rows
    fireEvent.touchStart(first.viewport)
    const dragged = 20 * PILL_PITCH
    first.viewport.scrollLeft = dragged

    const pill = announcedPills(first.viewport)[1]
    pill.focus()

    const fade = Number.parseFloat(
      getComputedStyle(first.viewport).getPropertyValue(EDGE_FADE_PROPERTY)
    )
    expect(fade).toBeGreaterThan(0)
    expect(first.viewport.scrollLeft).toBe(
      revealScrollLeft({
        scrollLeft: dragged,
        viewportWidth: VIEWPORT_WIDTH,
        pillStart: pill.offsetLeft,
        pillWidth: PILL_WIDTH,
        fade,
        maxScrollLeft: first.viewport.scrollWidth - VIEWPORT_WIDTH,
      })
    )

    // Tabbing out leaves the strip where the reveal put it, rather than
    // thawing it back into a loop.
    const revealed = first.viewport.scrollLeft
    pill.blur()
    expect(first.track.dataset.frozen).toBe('true')
    expect(first.viewport.scrollLeft).toBe(revealed)
  })

  test('a visitor who asked for no motion is left with the strips they already have', () => {
    // Under reduced motion both rows are static strips already; marking one
    // would leave a stale attribute for the reduced-motion rules to fight.
    setReducedMotion(true)
    const { rows } = renderLaidOutRows()

    for (const { viewport, track } of rows) {
      fireEvent.touchStart(viewport)
      const scrolledNatively = fireEvent.wheel(viewport, {
        deltaX: 40,
        deltaY: 0,
      })
      expect(scrolledNatively).toBe(true)
      expect(isHandedOver(viewport)).toBe(false)
      expect(track.dataset.frozen).toBeUndefined()
      expect(viewport.scrollLeft).toBe(0)
    }
  })
})
