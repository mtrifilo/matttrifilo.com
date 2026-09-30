import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { FEATURED_THEMES } from '@/lib/chat/featuring'
import { cssBlock } from '@/test/css-block'
import { setTouchDevice } from '@/test/touch-device'
import {
  seeAllQuestionsLabel,
  SHOW_FEWER_LABEL,
  STARTER_LIST_THEMES,
  STARTER_QUESTIONS,
  STARTER_THEME_HEADINGS,
  STARTER_UNTAGGED_HEADING,
} from './copy'
import { useActivationPress } from './pointer'
import { StarterTicker } from './starter-ticker'
import {
  EDGE_FADE_PROPERTY,
  progressForScrollLeft,
  SHARED_CUT_PROPERTY,
  SHARED_WIDTH_PROPERTY,
  TICKER_ANIMATION_NAME,
  TICKER_COPIES,
  tickerRows,
  TOUCH_DIRECTION_THRESHOLD_PX,
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

/**
 * The question pills a screen reader and the tab key reach, which are the
 * named group's buttons: the control that opens the list sits outside it.
 */
function questionPills(): HTMLElement[] {
  return within(
    screen.getByRole('group', { name: 'Starter questions' })
  ).getAllByRole('button')
}

/** The control that opens and closes the list of every question. */
function listToggle(): HTMLElement {
  const control = document.querySelector<HTMLElement>('button[aria-expanded]')
  if (!control) throw new Error('the ticker rendered no list control')
  return control
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
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} />
    )
    const { rows } = tickerOf(container)

    expect(rows).toHaveLength(2)
    for (const { track } of rows) {
      expect(track.querySelectorAll('.starter-ticker-copy')).toHaveLength(
        TICKER_COPIES
      )
    }
  })

  test('puts the odd questions in the first row and the even ones in the second', () => {
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} />
    )
    const [first, second] = tickerOf(container).rows

    const copiesOf = (row: readonly string[]) =>
      Array.from({ length: TICKER_COPIES }, () => row).flat()
    expect(pillTexts(first.viewport)).toEqual(copiesOf(FIRST_ROW))
    expect(pillTexts(second.viewport)).toEqual(copiesOf(SECOND_ROW))
  })

  test('announces every question in the pool exactly once', () => {
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)

    // By role, so this counts what a screen reader and the tab key reach:
    // the trailing copies are aria-hidden and are not in the tree. A copy
    // that lost its aria-hidden would read as the pool said twice, which is
    // the failure no other test here would notice.
    const announced = questionPills().map(pill => pill.textContent)
    expect(announced).toEqual([...FIRST_ROW, ...SECOND_ROW])
    expect(new Set(announced)).toEqual(new Set(STARTER_QUESTIONS))
  })

  test('every announced pill is a real, focusable button', () => {
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)

    for (const pill of questionPills()) {
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
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} />
    )

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
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={q => picked.push(q)} />
    )
    const [first] = tickerOf(container).rows

    const pill = first.track
      .querySelector('.starter-ticker-copy[aria-hidden="true"]')
      ?.querySelector('button')
    if (!pill) throw new Error('the silent copy rendered no pills')

    fireEvent.click(pill)
    expect(picked).toEqual([FIRST_ROW[0]])
  })

  test('names the rows once, as one group', () => {
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)

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
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} />
    )

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
 * over, so both are stated: the copy's width before the render (one number
 * for every copy, or one worked out from the copy itself), and the
 * browser's animation on each track after it (one progress for both rows,
 * or one per row).
 */
function renderMovingRows({
  copyWidth = COPY_WIDTH_MEASURED,
  progress = 0.25,
}: {
  copyWidth?: number | ((copy: Element) => number)
  progress?: number | readonly [number, number]
} = {}) {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const rect = REAL_BOUNDING_RECT.call(this)
    if (!this.classList.contains('starter-ticker-copy')) return rect
    const width = typeof copyWidth === 'number' ? copyWidth : copyWidth(this)
    return { ...rect.toJSON(), width } as DOMRect
  }
  const { container } = render(
    <StarterTicker listHeadingLevel={2} onPick={() => {}} />
  )
  const { rows } = tickerOf(container)
  rows.forEach(({ track }, index) => {
    const rowProgress =
      typeof progress === 'number' ? progress : progress[index]
    track.getAnimations = () => [runningLoop(rowProgress)]
  })
  return rows
}

/** Where a test finger lands, in the page's coordinates. */
const FINGER_X = 180
const FINGER_Y = 400

/** A finger as a touch event lists it. */
function finger(
  target: HTMLElement,
  x = FINGER_X,
  y = FINGER_Y,
  identifier = 1
): Partial<Touch> {
  return { identifier, target, clientX: x, clientY: y }
}

/** A finger landing on `target`, and staying down. */
function fingerDown(target: HTMLElement, touch = finger(target)): boolean {
  return fireEvent.touchStart(target, {
    touches: [touch],
    changedTouches: [touch],
  })
}

/**
 * The finger that landed at the default point, now moved by (dx, dy) and
 * still down. Returns whether the move was left uncancelled.
 */
function fingerMove(target: HTMLElement, dx: number, dy: number): boolean {
  const moved = finger(target, FINGER_X + dx, FINGER_Y + dy)
  return fireEvent.touchMove(target, {
    touches: [moved],
    changedTouches: [moved],
  })
}

/** The finger lifting, with no other finger left down. */
function fingerUp(target: HTMLElement): void {
  fireEvent.touchEnd(target, {
    touches: [],
    changedTouches: [finger(target)],
  })
}

/**
 * A drag along a row, reading ahead (right to left): a finger lands and
 * moves sideways past the threshold, and stays down, as it does while the
 * browser scrolls the strip under it.
 */
function dragSideways(target: HTMLElement): void {
  fingerDown(target)
  fingerMove(target, -(TOUCH_DIRECTION_THRESHOLD_PX + 4), 1)
}

/** Whether a row is held still under a finger that has shown no direction. */
function isTouchHeld(viewport: HTMLElement): boolean {
  return viewport.dataset.touchHeld === 'true'
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
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} />
    )
    const { rows } = tickerOf(container)
    for (const { track } of rows)
      track.getAnimations = () => [runningLoop(0.25)]

    announcedPills(rows[0].viewport)[0].focus()
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
  // What the rows' clientWidth reports; a test that rotates the phone
  // changes it.
  let viewportWidth = VIEWPORT_WIDTH

  let stylesheet: HTMLStyleElement | undefined

  afterEach(() => {
    viewportWidth = VIEWPORT_WIDTH
    stylesheet?.remove()
    stylesheet = undefined
  })

  /**
   * Moving rows laid out the way a browser would lay them out: every pill
   * the same pitch, both copies end to end, and the freeze's lead pushing
   * every pill right while the track is frozen. Happy DOM lays nothing out,
   * so these offsets are what give "the pill at the left edge" a meaning.
   * Each row's copy is as wide as its own pills, so the second row, one
   * question shorter, is the shorter strip, as it is in a browser.
   *
   * The returned `copyWidth` is the first row's.
   */
  function renderLaidOutRows(
    progress: number | readonly [number, number] = 0.25
  ) {
    stylesheet = document.createElement('style')
    stylesheet.textContent = TICKER_RULES.map(rule =>
      cssBlock(GLOBALS_CSS, rule)
    ).join('\n')
    document.head.append(stylesheet)

    const copyWidth = FIRST_ROW.length * PILL_PITCH
    const rows = renderMovingRows({
      copyWidth: copy => copy.children.length * PILL_PITCH,
      progress,
    })
    for (const { viewport, track } of rows) {
      const pills = [...track.querySelectorAll<HTMLElement>('button')]
      pills.forEach((pill, index) => {
        Object.defineProperty(pill, 'offsetLeft', {
          get: () => index * PILL_PITCH + leadOf(track),
        })
        Object.defineProperty(pill, 'offsetWidth', { get: () => PILL_WIDTH })
      })
      Object.defineProperty(viewport, 'clientWidth', {
        get: () => viewportWidth,
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

  /** How much of a handed-over row's start its trim cuts away. */
  function cutOf(track: HTMLElement): number {
    return (
      Number.parseFloat(track.style.getPropertyValue(SHARED_CUT_PROPERTY)) || 0
    )
  }

  /**
   * Where a row is in its own pixels, the ones its pills' offsets and its
   * freeze are measured in: its scrollLeft plus whatever its trim cut away.
   */
  function positionOf({
    viewport,
    track,
  }: {
    viewport: HTMLElement
    track: HTMLElement
  }): number {
    return viewport.scrollLeft + cutOf(track)
  }

  /** The furthest a handed-over row scrolls once trimmed, as a browser would lay it out. */
  function trimmedMaxOf({
    viewport,
    track,
  }: {
    viewport: HTMLElement
    track: HTMLElement
  }): number {
    const width = Number.parseFloat(
      track.style.getPropertyValue(SHARED_WIDTH_PROPERTY)
    )
    return width - cutOf(track) - viewport.clientWidth
  }

  /** One copy of a row, as the test lays it out. */
  function copyWidthOf(track: HTMLElement): number {
    const copy = track.querySelector('.starter-ticker-copy')
    return (copy?.children.length ?? 0) * PILL_PITCH
  }

  /** Where a row's freeze puts it: its own loop, in its own pixels. */
  function frozenAt(track: HTMLElement, progress: number): number {
    return progress * copyWidthOf(track) + leadOf(track)
  }

  /**
   * Whether two positions of a row show the same pixels: equal, or a whole
   * copy apart, which is the same pills in the other copy.
   */
  function samePixels(track: HTMLElement, a: number, b: number): boolean {
    const copy = copyWidthOf(track)
    const apart = Math.abs(a - b)
    return apart < 0.5 || Math.abs(apart - copy) < 0.5
  }

  /** The fade width the row reads off the stylesheet. */
  function fadeOf(viewport: HTMLElement): number {
    return Number.parseFloat(
      getComputedStyle(viewport).getPropertyValue(EDGE_FADE_PROPERTY)
    )
  }

  /** Whether a pill is fully inside the row and clear of both fades. */
  function isClearOfFades(
    row: { viewport: HTMLElement; track: HTMLElement },
    pill: HTMLElement
  ): boolean {
    const start = pill.offsetLeft - positionOf(row)
    const fade = fadeOf(row.viewport)
    return start >= fade && start + PILL_WIDTH <= viewportWidth - fade
  }

  test('reads the lead off the stylesheet it is about to rely on', () => {
    // The position tests below are only as good as this: with no lead the
    // conversion is tested with half its terms at zero.
    const { rows } = renderLaidOutRows()
    rows[0].track.dataset.frozen = 'true'
    expect(leadOf(rows[0].track)).toBeGreaterThan(0)
  })

  test('a tap on a moving row asks its question and hands nothing over', () => {
    // A finger that lands and lifts without traveling the threshold is a
    // tap: the rows hold still under it, so the pill is still there when
    // it lifts, and move again after it. Nothing cancels the touch, so the
    // browser's click still lands on the pill. Under MTC-75 the same tap
    // handed both rows over for good; since MTC-79 it does not.
    const picked: string[] = []
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = REAL_BOUNDING_RECT.call(this)
      if (!this.classList.contains('starter-ticker-copy')) return rect
      return { ...rect.toJSON(), width: COPY_WIDTH_MEASURED } as DOMRect
    }
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={q => picked.push(q)} />
    )
    const { rows } = tickerOf(container)
    for (const { track } of rows)
      track.getAnimations = () => [runningLoop(0.25)]
    const [first] = rows
    const pill = announcedPills(first.viewport)[0]

    const notCancelled = fingerDown(pill, finger(pill))
    // A finger that shakes a little is still a tap.
    fingerMove(pill, 3, -2)
    for (const { viewport, track } of rows) {
      expect(isTouchHeld(viewport)).toBe(true)
      expect(track.dataset.frozen).toBe('true')
    }
    fingerUp(pill)
    fireEvent.click(pill)

    expect(notCancelled).toBe(true)
    expect(picked).toEqual([FIRST_ROW[0]])
    for (const { viewport, track } of rows) {
      expect(isHandedOver(viewport)).toBe(false)
      expect(track.dataset.frozen).toBeUndefined()
      expect(isTouchHeld(viewport)).toBe(false)
    }
  })

  test('a finger resting on a row holds both rows until it shows its direction', () => {
    // A diagonal of a few pixels is still below the threshold: nothing is
    // decided, so nothing is handed over, and both rows stay held.
    const { rows } = renderLaidOutRows()
    const [first] = rows

    fingerDown(first.viewport)
    fingerMove(first.viewport, 5, 5)

    for (const { viewport, track } of rows) {
      expect(isHandedOver(viewport)).toBe(false)
      // Held with the freeze focus uses, so the pills stand where the loop
      // had them.
      expect(track.dataset.frozen).toBe('true')
      expect(isTouchHeld(viewport)).toBe(true)
    }
    fingerUp(first.viewport)
    for (const { viewport, track } of rows) {
      expect(isTouchHeld(viewport)).toBe(false)
      expect(track.dataset.frozen).toBeUndefined()
      expect(viewport.scrollLeft).toBe(0)
    }
  })

  test('a lifted finger sets each row moving from the pixels it held', () => {
    // The hold is a freeze, so letting go is a thaw: the loop restarts at
    // the progress the row showed, not at the start of the loop.
    const { rows } = renderLaidOutRows([0.27, 0.61])
    fingerDown(rows[0].viewport)
    fingerUp(rows[0].viewport)

    const offsets = rows.map(({ track }) =>
      Number.parseFloat(track.style.getPropertyValue('--ticker-offset'))
    )
    expect(offsets[0]).toBeCloseTo(0.27)
    expect(offsets[1]).toBeCloseTo(0.61)
  })

  test('a touch the browser takes lets go of the rows as a lift does', () => {
    const { rows } = renderLaidOutRows()
    fingerDown(rows[0].viewport)
    fireEvent.touchCancel(rows[0].viewport, {
      touches: [],
      changedTouches: [finger(rows[0].viewport)],
    })
    for (const { viewport, track } of rows) {
      expect(isTouchHeld(viewport)).toBe(false)
      expect(track.dataset.frozen).toBeUndefined()
    }
  })

  test('a finger resting on one row keeps both held after a finger on the other lifts', () => {
    const { rows } = renderLaidOutRows()
    const [first, second] = rows
    const one = finger(first.viewport)
    const two = finger(second.viewport, FINGER_X, FINGER_Y + 60, 2)
    fingerDown(first.viewport, one)
    fireEvent.touchStart(second.viewport, {
      touches: [one, two],
      changedTouches: [two],
    })

    fireEvent.touchEnd(first.viewport, {
      touches: [two],
      changedTouches: [one],
    })
    for (const { viewport } of rows) expect(isTouchHeld(viewport)).toBe(true)

    fireEvent.touchEnd(second.viewport, {
      touches: [],
      changedTouches: [two],
    })
    for (const { viewport } of rows) expect(isTouchHeld(viewport)).toBe(false)
  })

  test('a keyboard-focused row a finger holds stays frozen for focus when it lifts', () => {
    // Focus froze it first; the touch only held it, so letting go leaves it
    // to blur, which is what sets a focused row moving again.
    const { rows } = renderLaidOutRows()
    const [first] = rows
    announcedPills(first.viewport)[1].focus()
    fingerDown(first.viewport)
    fingerUp(first.viewport)
    expect(first.track.dataset.frozen).toBe('true')
    ;(document.activeElement as HTMLElement).blur()
    expect(first.track.dataset.frozen).toBeUndefined()
  })

  test('focus leaving a row a finger holds does not set it moving under the finger', () => {
    const { rows } = renderLaidOutRows()
    const [first] = rows
    announcedPills(first.viewport)[1].focus()
    fingerDown(first.viewport)
    ;(document.activeElement as HTMLElement).blur()
    expect(first.track.dataset.frozen).toBe('true')

    fingerUp(first.viewport)
    expect(first.track.dataset.frozen).toBeUndefined()
  })

  test('a pinch that starts on a row is not a drag along it', () => {
    const { rows } = renderLaidOutRows()
    const [first] = rows
    const one = finger(first.viewport)
    const two = finger(first.viewport, FINGER_X + 30, FINGER_Y, 2)
    fingerDown(first.viewport, one)
    fireEvent.touchStart(first.viewport, {
      touches: [one, two],
      changedTouches: [two],
    })
    const spread = finger(first.viewport, FINGER_X - 20, FINGER_Y)
    fireEvent.touchMove(first.viewport, {
      touches: [spread, finger(first.viewport, FINGER_X + 50, FINGER_Y, 2)],
      changedTouches: [spread],
    })

    for (const { viewport, track } of rows) {
      expect(isHandedOver(viewport)).toBe(false)
      expect(isTouchHeld(viewport)).toBe(false)
      expect(track.dataset.frozen).toBeUndefined()
    }
  })

  test('a drag up or down a row is the page scrolling, and leaves both rows moving', () => {
    // Matt, 2026-09-28 (MTC-79): a page scroll that starts on a row must
    // not stop the rows. The move is never cancelled, so the browser
    // scrolls the page, and the rest of the touch changes nothing even if
    // it turns sideways.
    const { rows } = renderLaidOutRows()
    const [first] = rows

    fingerDown(first.viewport)
    const scrolledNatively = fingerMove(first.viewport, 3, -30)
    fingerMove(first.viewport, -80, -35)

    expect(scrolledNatively).toBe(true)
    for (const { viewport, track } of rows) {
      expect(isHandedOver(viewport)).toBe(false)
      expect(track.dataset.frozen).toBeUndefined()
      expect(isTouchHeld(viewport)).toBe(false)
      expect(viewport.scrollLeft).toBe(0)
    }
    // Once the touch is the page's, a scroll the browser gives the row
    // does not hand it over either.
    first.viewport.scrollLeft = 4
    fireEvent.scroll(first.viewport)
    for (const { viewport } of rows) expect(isHandedOver(viewport)).toBe(false)
    first.viewport.scrollLeft = 0

    // The next drag along a row is read afresh.
    fingerUp(first.viewport)
    dragSideways(first.viewport)
    for (const { viewport } of rows) expect(isHandedOver(viewport)).toBe(true)
  })

  test('a drag along a row hands both over once it passes the threshold, and not before', () => {
    const { rows } = renderLaidOutRows()
    const [first] = rows

    fingerDown(first.viewport)
    fingerMove(first.viewport, -(TOUCH_DIRECTION_THRESHOLD_PX - 1), 0)
    for (const { viewport } of rows) expect(isHandedOver(viewport)).toBe(false)

    const scrolledNatively = fingerMove(
      first.viewport,
      -TOUCH_DIRECTION_THRESHOLD_PX,
      2
    )

    // Left to the browser, which scrolls the strip with the rest of the drag.
    expect(scrolledNatively).toBe(true)
    for (const { viewport, track } of rows) {
      expect(isHandedOver(viewport)).toBe(true)
      expect(track.dataset.frozen).toBe('true')
      expect(isTouchHeld(viewport)).toBe(false)
    }
  })

  test('a second finger landing does not start the first one over', () => {
    const { rows } = renderLaidOutRows()
    const [first] = rows
    const one = finger(first.viewport)
    const two = finger(first.viewport, FINGER_X + 40, FINGER_Y + 60, 2)

    fingerDown(first.viewport, one)
    fireEvent.touchStart(first.viewport, {
      touches: [one, two],
      changedTouches: [two],
    })
    fingerMove(first.viewport, -(TOUCH_DIRECTION_THRESHOLD_PX + 4), 0)

    expect(isHandedOver(first.viewport)).toBe(true)
  })

  test('a row the browser scrolls under a finger is handed over, keeping what it scrolled', () => {
    // A held row is a scroll container, and the browser may take a sideways
    // drag before the finger has passed the threshold. The pills it
    // scrolled into place stay where they are.
    const progress = 0.27
    const { rows } = renderLaidOutRows(progress)
    const [first, second] = rows

    fingerDown(first.viewport)
    first.viewport.scrollLeft += 6
    fireEvent.scroll(first.viewport)

    for (const { viewport } of rows) {
      expect(isHandedOver(viewport)).toBe(true)
      expect(isTouchHeld(viewport)).toBe(false)
    }
    expect(
      samePixels(
        first.track,
        positionOf(first),
        frozenAt(first.track, progress) + 6
      )
    ).toBe(true)
    // The other row shows what its own loop showed, with no share of it.
    expect(
      samePixels(
        second.track,
        positionOf(second),
        frozenAt(second.track, progress)
      )
    ).toBe(true)
  })

  test('a moving row the browser had already scrolled freezes showing the same pixels', () => {
    // A coarse-pointer row is a scroll container while it moves, so it can
    // carry a scroll offset on top of its loop; the freeze keeps both.
    const progress = 0.27
    const { rows } = renderLaidOutRows(progress)
    const [first] = rows
    first.viewport.scrollLeft = 6

    dragSideways(first.viewport)

    expect(
      samePixels(
        first.track,
        positionOf(first),
        frozenAt(first.track, progress) + 6
      )
    ).toBe(true)
  })

  test('a moving row that scrolls with no finger on it is not handed over', () => {
    // Only a finger is the visitor reading by hand; a scroll with none (the
    // placement's own reset, a browser's focus scrolling) hands nothing over.
    const { rows } = renderLaidOutRows()
    const [first] = rows

    fireEvent.scroll(first.viewport)
    fingerDown(first.viewport)
    fingerUp(first.viewport)
    fireEvent.scroll(first.viewport)

    for (const { viewport } of rows) expect(isHandedOver(viewport)).toBe(false)
  })

  test('a tap on a strip already handed over asks its question', () => {
    const picked: string[] = []
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = REAL_BOUNDING_RECT.call(this)
      if (!this.classList.contains('starter-ticker-copy')) return rect
      return { ...rect.toJSON(), width: COPY_WIDTH_MEASURED } as DOMRect
    }
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={q => picked.push(q)} />
    )
    const { rows } = tickerOf(container)
    for (const { track } of rows)
      track.getAnimations = () => [runningLoop(0.25)]
    const [first] = rows
    dragSideways(first.viewport)
    fingerUp(first.viewport)

    const pill = announcedPills(first.viewport)[0]
    const notCancelled = fingerDown(pill, finger(pill))
    fingerUp(pill)
    fireEvent.click(pill)

    expect(notCancelled).toBe(true)
    expect(isHandedOver(first.viewport)).toBe(true)
    expect(picked).toEqual([FIRST_ROW[0]])
  })

  test('a sideways drag stops the dragged row where it was, as a scroll strip', () => {
    const progress = 0.27
    const { rows, copyWidth } = renderLaidOutRows(progress)
    const [first] = rows
    const before = pillAtLeftEdge(first.track, progress * copyWidth)

    dragSideways(announcedPills(first.viewport)[0])

    expect(isHandedOver(first.viewport)).toBe(true)
    expect(first.track.dataset.frozen).toBe('true')
    // The same pill is at the edge before and after, and it is part way
    // through the pool, so a hand-over that dropped the position (or the
    // lead) would land on a different one.
    expect(before).toBeGreaterThan(0)
    expect(pillAtLeftEdge(first.track, positionOf(first))).toBe(before)
    expect(positionOf(first)).toBe(progress * copyWidth + leadOf(first.track))
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
    expect(positionOf(first)).toBeCloseTo(
      progress * copyWidth + leadOf(first.track) + 40
    )
    // The hand-over itself kept the pill at the edge where it was.
    expect(pillAtLeftEdge(first.track, positionOf(first) - 40)).toBe(before)
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
    expect(positionOf(first)).toBeCloseTo(
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
    for (const { viewport, track } of rows) {
      expect(isHandedOver(viewport)).toBe(false)
      expect(track.dataset.frozen).toBeUndefined()
    }
  })

  describe('both rows, as one strip', () => {
    /**
     * Scroll a row the way a drag or a native wheel would: the position
     * changes, then the browser reports it. Happy DOM sends no scroll event
     * when scrollLeft is set, so the report is sent here.
     */
    function scrollBy(viewport: HTMLElement, pixels: number): void {
      viewport.scrollLeft += pixels
      fireEvent.scroll(viewport)
    }

    /**
     * Counts every write to a row's scrollLeft from here on, and by default
     * keeps the position to whole pixels as some browsers do, so that what a
     * row reads back is not always what was written to it.
     */
    function countWrites(
      viewport: HTMLElement,
      { round = true } = {}
    ): { count: number } {
      let owner: object | null = viewport
      let property: PropertyDescriptor | undefined
      while (owner && !property) {
        property = Object.getOwnPropertyDescriptor(owner, 'scrollLeft')
        owner = Object.getPrototypeOf(owner)
      }
      const { get, set } = property ?? {}
      if (!get || !set) throw new Error('scrollLeft has no accessor to spy on')
      const writes = { count: 0 }
      Object.defineProperty(viewport, 'scrollLeft', {
        configurable: true,
        get: () => get.call(viewport),
        set: (value: number) => {
          writes.count += 1
          set.call(viewport, round ? Math.round(value) : value)
        },
      })
      return writes
    }

    /** The furthest a row could scroll untrimmed, as the test laid it out. */
    function naturalMaxOf(viewport: HTMLElement): number {
      return viewport.scrollWidth - viewport.clientWidth
    }

    test('a drag on the second row hands both over, each showing what its own loop showed', () => {
      // Different points in their loops, so a hand-over that gave one row
      // the other's position, or skipped the untouched row, lands wrong.
      // These two are also a pairing where each row is best placed on its
      // second copy, which shows the same pills.
      const progress = [0.27, 0.61] as const
      const { rows } = renderLaidOutRows(progress)
      const edges = rows.map(({ track }, index) =>
        pillAtLeftEdge(track, frozenAt(track, progress[index]))
      )

      dragSideways(announcedPills(rows[1].viewport)[0])

      rows.forEach((row, index) => {
        const { viewport, track } = row
        expect(isHandedOver(viewport)).toBe(true)
        expect(track.dataset.frozen).toBe('true')
        expect(
          samePixels(track, positionOf(row), frozenAt(track, progress[index]))
        ).toBe(true)
        const count = announcedPills(viewport).length
        expect(edges[index]).toBeGreaterThan(0)
        expect(pillAtLeftEdge(track, positionOf(row)) % count).toBe(
          edges[index] % count
        )
      })
      // One position for both.
      expect(rows[0].viewport.scrollLeft).toBe(rows[1].viewport.scrollLeft)
    })

    test('a sideways wheel on the first row moves both rows by its delta', () => {
      const progress = [0.25, 0.4] as const
      const { rows } = renderLaidOutRows(progress)

      wheelAt(rows[0].viewport, 1000, { deltaX: 40, deltaY: 0 })
      wheelAt(rows[0].viewport, 1016, { deltaX: 25, deltaY: 0 })

      rows.forEach((row, index) => {
        expect(
          samePixels(
            row.track,
            positionOf(row),
            frozenAt(row.track, progress[index]) + 65
          )
        ).toBe(true)
      })
      expect(rows[0].viewport.scrollLeft).toBe(rows[1].viewport.scrollLeft)
    })

    test('a scroll on the second row carries the first, the dragged row is never written, and the echo carries nothing back', () => {
      // Fractional loop positions, so the rows' offsets are not whole pixels
      // and a row rounds what it is given.
      const { rows } = renderLaidOutRows([0.3013, 0.5071])
      const [first, second] = rows
      dragSideways(first.viewport)
      fireEvent.touchEnd(first.viewport)
      const firstAt = first.viewport.scrollLeft
      // The dragged row sits at a fraction of a pixel, the followed one at
      // whole pixels, so the echo reads back a position the drag never had.
      const firstWrites = countWrites(first.viewport)
      const secondWrites = countWrites(second.viewport, { round: false })

      scrollBy(second.viewport, 120.4)
      expect(
        Math.abs(first.viewport.scrollLeft - (firstAt + 120.4))
      ).toBeLessThan(1)
      expect(first.viewport.scrollLeft).not.toBe(second.viewport.scrollLeft)
      expect(firstWrites.count).toBe(1)
      // The drag's own write, nothing from the component: a write to the
      // row under a finger is what makes it stutter.
      expect(secondWrites.count).toBe(1)

      // The write to the first row makes a browser report a scroll on it
      // too. That report is the rows' own doing, not the visitor's, and
      // answering it would bounce the position between the rows.
      fireEvent.scroll(first.viewport)
      fireEvent.scroll(second.viewport)
      expect(firstWrites.count).toBe(1)
      expect(secondWrites.count).toBe(1)
    })

    test('both rows are trimmed to the reach the shorter one allows, at either end', () => {
      // The second row holds one question fewer, so from the same point in
      // both loops it has less ahead of it and less behind it; the shared
      // window is that much each way, and both rows scroll through exactly
      // it, so the browser stops them together.
      const progress = 0.25
      const { rows } = renderLaidOutRows(progress)

      dragSideways(rows[0].viewport)

      // Read once frozen, when each track carries its lead.
      const at = rows.map(({ track }) => frozenAt(track, progress))
      const behind = Math.min(...at)
      const ahead = Math.min(
        ...rows.map(({ viewport }, index) => naturalMaxOf(viewport) - at[index])
      )
      for (const row of rows) {
        expect(row.viewport.scrollLeft).toBeCloseTo(behind)
        expect(trimmedMaxOf(row)).toBeCloseTo(behind + ahead)
        // Never beyond what the row itself holds, at either end.
        expect(cutOf(row.track)).toBeGreaterThanOrEqual(0)
        expect(cutOf(row.track) + trimmedMaxOf(row)).toBeLessThanOrEqual(
          naturalMaxOf(row.viewport) + 0.5
        )
      }
      // The second row is the one that runs out, both ways: nothing of it
      // is cut, and its trimmed end is its own end.
      expect(cutOf(rows[1].track)).toBe(0)
      expect(trimmedMaxOf(rows[1])).toBeCloseTo(naturalMaxOf(rows[1].viewport))
    })

    test('every question stays reachable by dragging, wherever the loops stopped', () => {
      // A row stopped near the start of its loop has little behind it. Each
      // row may be placed on either copy, so the window both share still
      // brings every question of each row clear of the fades somewhere,
      // in one copy or the other.
      const stops = [0.01, 0.2, 0.45, 0.7, 0.99]
      for (const a of stops) {
        for (const b of stops) {
          const { rows } = renderLaidOutRows([a, b])
          dragSideways(rows[0].viewport)
          for (const row of rows) {
            const max = trimmedMaxOf(row)
            const cut = cutOf(row.track)
            const fade = fadeOf(row.viewport)
            const count = announcedPills(row.viewport).length
            const pills = [...row.track.querySelectorAll<HTMLElement>('button')]
            for (let index = 0; index < count; index += 1) {
              const reachable = [pills[index], pills[index + count]].some(
                pill => {
                  // The scrollLeft range that shows the pill clear of both
                  // fades, against the range the window allows.
                  const start = pill.offsetLeft - cut
                  const low = start + PILL_WIDTH - viewportWidth + fade
                  const high = start - fade
                  return Math.max(low, 0) <= Math.min(high, max)
                }
              )
              expect(reachable, `${a}, ${b}: pill ${index}`).toBe(true)
            }
          }
          cleanup()
          stylesheet?.remove()
        }
      }
    })

    test('a row that could not be handed over yet is left alone, then joins', () => {
      // Its loop has not started, so there is no position to freeze it at.
      // Writing its scrollLeft while it still moves would add to its
      // transform; it joins on the next sideways drag, from where it then
      // is.
      const { rows } = renderLaidOutRows(0.3)
      const [first, second] = rows
      second.track.getAnimations = () => []
      dragSideways(first.viewport)
      expect(isHandedOver(second.viewport)).toBe(false)

      const secondWrites = countWrites(second.viewport)
      scrollBy(first.viewport, 80)
      expect(secondWrites.count).toBe(0)

      second.track.getAnimations = () => [runningLoop(0.6)]
      const firstBefore = positionOf(first)
      dragSideways(first.viewport)
      expect(isHandedOver(second.viewport)).toBe(true)
      // Joining trims the first row again; it does not move it.
      expect(positionOf(first)).toBeCloseTo(firstBefore)
      expect(
        samePixels(
          second.track,
          positionOf(second),
          frozenAt(second.track, 0.6)
        )
      ).toBe(true)
      const joinedAt = positionOf(second)
      scrollBy(first.viewport, 50)
      expect(positionOf(second)).toBeCloseTo(joinedAt + 50)
    })

    test('a row holding keyboard focus when the other is touched keeps its focused pill in view', () => {
      // A pairing where moving the first row a copy on would widen the
      // window; with focus in it, it stays where the reveal put it.
      const { rows } = renderLaidOutRows([0.05, 0.9])
      const [first, second] = rows
      const pill = announcedPills(first.viewport)[2]
      pill.focus()
      expect(isClearOfFades(first, pill)).toBe(true)

      dragSideways(second.viewport)

      expect(isHandedOver(first.viewport)).toBe(true)
      expect(document.activeElement).toBe(pill)
      expect(isClearOfFades(first, pill)).toBe(true)
    })

    test('a sideways wheel on a row that cannot be handed over yet hands over the other and leaves itself alone', () => {
      // Scrolling a row whose track is still transformed would add one
      // offset to the other, and cancelling the event would stop the page.
      const progress = 0.35
      const { rows } = renderLaidOutRows(progress)
      const [first, second] = rows
      first.track.getAnimations = () => []

      const notCancelled = wheelAt(first.viewport, 1000, {
        deltaX: 40,
        deltaY: 0,
      })

      expect(notCancelled).toBe(true)
      expect(isHandedOver(first.viewport)).toBe(false)
      expect(first.track.dataset.frozen).toBeUndefined()
      expect(first.viewport.scrollLeft).toBe(0)
      expect(isHandedOver(second.viewport)).toBe(true)
      // Frozen where its loop was, with no share of the wheel's delta.
      expect(positionOf(second)).toBeCloseTo(frozenAt(second.track, progress))
    })

    test('a focused pill is revealed on its own row, and the other row follows the same distance', () => {
      // The first row stopped near the start of its loop and is placed on
      // its second copy, which shows the same pills. Tab reaches its second
      // pill in the first copy, a copy back, where the row shows almost
      // exactly what it showed; the second row moves only that little, and
      // the two share one position again from there.
      const { rows } = renderLaidOutRows([0.05, 0.9])
      const [first, second] = rows
      dragSideways(first.viewport)
      fireEvent.touchEnd(first.viewport)
      const firstFrom = positionOf(first)
      const secondFrom = positionOf(second)
      const pill = announcedPills(first.viewport)[1]

      pill.focus()

      expect(isClearOfFades(first, pill)).toBe(true)
      // The first row was showing its second copy, so the pill's own copy
      // is most of a copy back, but on screen the row moves only a little.
      const period = copyWidthOf(first.track)
      const moved = positionOf(first) - firstFrom
      expect(moved).toBeLessThan(-period / 2)
      const seen = [moved, moved + period, moved - period].reduce((a, b) =>
        Math.abs(b) < Math.abs(a) ? b : a
      )
      expect(Math.abs(seen)).toBeLessThan(PILL_PITCH)
      // The other row moves what the first row was seen to move, not the
      // copy it jumped: a copy of one row is not a copy of the other.
      expect(
        samePixels(second.track, positionOf(second), secondFrom + seen)
      ).toBe(true)
      expect(first.viewport.scrollLeft).toBe(second.viewport.scrollLeft)

      const revealed = positionOf(first)
      scrollBy(second.viewport, 40)
      expect(positionOf(first)).toBeCloseTo(revealed + 40)
    })

    test('a finger resting on one row holds it while the other row still coasts', () => {
      // On iOS a touch stops only the scroller it lands on. A row still
      // coasting from an earlier flick must not carry the touched row, and
      // the question under the finger, along with it.
      const { rows } = renderLaidOutRows([0.3, 0.6])
      const [first, second] = rows
      dragSideways(first.viewport)
      fireEvent.touchEnd(first.viewport)
      scrollBy(first.viewport, 200)

      fireEvent.touchStart(second.viewport)
      const resting = second.viewport.scrollLeft
      scrollBy(first.viewport, 90)
      expect(second.viewport.scrollLeft).toBe(resting)
      // Held to the touched row instead of running on without it.
      expect(first.viewport.scrollLeft).toBe(resting)

      fireEvent.touchEnd(second.viewport)
      scrollBy(first.viewport, 50)
      expect(second.viewport.scrollLeft).toBe(resting + 50)
    })

    test("a rotation that changes both rows' width keeps them in step", () => {
      // Both rows are the same width, so a rotation moves both trimmed ends
      // by the same amount, and the browser's clamp to the new end lands
      // both on the same position; the next drag moves both from there.
      const { rows } = renderLaidOutRows([0.2, 0.7])
      const [first, second] = rows
      dragSideways(first.viewport)
      scrollBy(first.viewport, trimmedMaxOf(first) - first.viewport.scrollLeft)

      viewportWidth = VIEWPORT_WIDTH + 400
      // What a browser does to each row on its own, then reports.
      for (const row of rows) {
        row.viewport.scrollLeft = Math.min(
          row.viewport.scrollLeft,
          trimmedMaxOf(row)
        )
      }
      expect(trimmedMaxOf(first)).toBeCloseTo(trimmedMaxOf(second))
      const writes = rows.map(({ viewport }) =>
        countWrites(viewport, { round: false })
      )
      fireEvent.scroll(first.viewport)
      fireEvent.scroll(second.viewport)
      expect(first.viewport.scrollLeft).toBe(second.viewport.scrollLeft)
      // Already together, so neither report writes to the other.
      expect(writes.map(({ count }) => count)).toEqual([0, 0])

      const before = second.viewport.scrollLeft
      scrollBy(first.viewport, -10)
      expect(second.viewport.scrollLeft).toBe(before - 10)
      expect(first.viewport.scrollLeft).toBe(before - 10)
    })

    test('a static strip scrolls on its own', () => {
      // Reduced motion is unchanged: nothing is handed over, so nothing is
      // shared, and each strip stays where its visitor puts it.
      setReducedMotion(true)
      const { rows } = renderLaidOutRows()
      const [first, second] = rows

      scrollBy(second.viewport, 90)
      expect(second.viewport.scrollLeft).toBe(90)
      expect(first.viewport.scrollLeft).toBe(0)
    })

    test('a keyboard focus before any hand-over moves only its own row', () => {
      // Focus freezes a row without handing it over; the rows share a
      // position only once the visitor has reached for them.
      const { rows } = renderLaidOutRows([0.3, 0.6])
      const [first, second] = rows
      announcedPills(first.viewport)[3].focus()
      expect(first.track.dataset.frozen).toBe('true')

      scrollBy(first.viewport, 50)
      expect(isHandedOver(first.viewport)).toBe(false)
      expect(isHandedOver(second.viewport)).toBe(false)
      expect(second.track.dataset.frozen).toBeUndefined()
      expect(second.viewport.scrollLeft).toBe(0)
    })

    test('rows handed over before the list opened come back where the visitor left them, still one strip', () => {
      const { rows } = renderLaidOutRows([0.27, 0.61])
      const [first, second] = rows
      dragSideways(announcedPills(first.viewport)[0])
      scrollBy(first.viewport, 40)
      const leftAt = rows.map(({ viewport }) => viewport.scrollLeft)
      const trimOf = ({ track }: { track: HTMLElement }) => [
        track.style.getPropertyValue(SHARED_CUT_PROPERTY),
        track.style.getPropertyValue(SHARED_WIDTH_PROPERTY),
      ]
      const trims = rows.map(trimOf)
      expect(leftAt[0]).toBe(leftAt[1])
      expect(leftAt[0]).toBeGreaterThan(0)

      fireEvent.click(listToggle())
      // A hidden box has no scroll position, which Happy DOM does not
      // model: the browser's reset, and its report, are stated here.
      for (const { viewport } of rows) {
        viewport.scrollLeft = 0
        fireEvent.scroll(viewport)
      }
      fireEvent.click(listToggle())

      rows.forEach((row, index) => {
        expect(isHandedOver(row.viewport)).toBe(true)
        expect(row.track.dataset.frozen).toBe('true')
        expect(row.viewport.scrollLeft).toBe(leftAt[index])
        expect(trimOf(row)).toEqual(trims[index])
      })
      scrollBy(second.viewport, 30)
      expect(first.viewport.scrollLeft).toBe(leftAt[0] + 30)
    })

    test('a pair opened over mid-coast comes back at one position', () => {
      // A row still coasting can be ahead of the last scroll event that
      // carried the other; the pair shares one position, so both come back
      // to the same one.
      const { rows } = renderLaidOutRows([0.27, 0.61])
      const [first, second] = rows
      dragSideways(announcedPills(first.viewport)[0])
      scrollBy(first.viewport, 40)
      const shared = first.viewport.scrollLeft
      second.viewport.scrollLeft = shared + 3

      fireEvent.click(listToggle())
      for (const { viewport } of rows) viewport.scrollLeft = 0
      fireEvent.click(listToggle())

      expect(first.viewport.scrollLeft).toBe(shared)
      expect(second.viewport.scrollLeft).toBe(shared)
    })
  })

  /**
   * Scroll the rows before their first placement, then place them. A row
   * measures zero wide until its copy has a width, so the scroll lands
   * first, and a new `startAt` is what makes it measure again.
   */
  function scrollThenPlace(scrolledTo: number, secondScrolledTo = 0) {
    const { container, rerender } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} startAt={0} />
    )
    const [first, second] = tickerOf(container).rows
    first.viewport.scrollLeft = scrolledTo
    second.viewport.scrollLeft = secondScrolledTo
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = REAL_BOUNDING_RECT.call(this)
      if (!this.classList.contains('starter-ticker-copy')) return rect
      return { ...rect.toJSON(), width: COPY_WIDTH_MEASURED } as DOMRect
    }
    rerender(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} startAt={1} />
    )
    return [first, second] as const
  }

  test('a moving row opens at scroll zero even if a finger scrolled it first', () => {
    // Under a coarse pointer a moving row is a scroll container from the
    // first paint, so a drag before the script runs can leave it scrolled;
    // the opening is computed for scroll zero.
    const [first] = scrollThenPlace(300)
    expect(first.track.dataset.placed).toBe('true')
    expect(first.viewport.scrollLeft).toBe(0)
  })

  test('a drag on one row before the script ran leaves the rows in step', () => {
    // Each row's first placement resets its own scroll, so neither carries
    // an offset the other lacks into the one position they later share.
    const rows = scrollThenPlace(0, 300)
    for (const { viewport, track } of rows) {
      expect(track.dataset.placed).toBe('true')
      expect(viewport.scrollLeft).toBe(0)
    }
  })

  test('a static strip keeps the scroll its visitor gave it', () => {
    setReducedMotion(true)
    const [first] = scrollThenPlace(300)
    expect(first.viewport.scrollLeft).toBe(300)
  })

  test('a row whose width is not measured yet is left moving', () => {
    // Converting the loop by a zero width would park the row at its start.
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} />
    )
    const { rows } = tickerOf(container)
    for (const { track } of rows) track.getAnimations = () => [runningLoop(0.4)]

    dragSideways(rows[0].viewport)
    expect(isHandedOver(rows[0].viewport)).toBe(false)
    expect(rows[0].track.dataset.frozen).toBeUndefined()
  })

  describe("the rows' wheel listener", () => {
    /**
     * Counts the wheel listeners attached to each row's box, from before the
     * render: the component attaches its own by hand when a row mounts.
     * Patched where an element actually finds the methods, which in the
     * test DOM is not the global EventTarget's prototype.
     */
    function countWheelListeners() {
      let owner: object | null = document.createElement('div')
      while (owner && !Object.hasOwn(owner, 'addEventListener')) {
        owner = Object.getPrototypeOf(owner)
      }
      if (!owner) throw new Error('no prototype carries addEventListener')
      const methods = owner as Pick<
        EventTarget,
        'addEventListener' | 'removeEventListener'
      >
      const realAdd = methods.addEventListener
      const realRemove = methods.removeEventListener
      const attached = new Map<EventTarget, Set<unknown>>()
      const on = (target: EventTarget) => {
        const set = attached.get(target) ?? new Set<unknown>()
        attached.set(target, set)
        return set
      }
      methods.addEventListener = function (
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean
      ) {
        if (type === 'wheel') on(this).add(listener)
        realAdd.call(this, type, listener, options)
      }
      methods.removeEventListener = function (
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: EventListenerOptions | boolean
      ) {
        if (type === 'wheel') on(this).delete(listener)
        realRemove.call(this, type, listener, options)
      }
      return {
        count: (target: EventTarget) => attached.get(target)?.size ?? 0,
        restore: () => {
          methods.addEventListener = realAdd
          methods.removeEventListener = realRemove
        },
      }
    }

    test('stays on rows that are still moving, a page scroll included', () => {
      // A sideways wheel is how a moving row is handed over on a desktop.
      const listeners = countWheelListeners()
      try {
        const { rows } = renderLaidOutRows()
        fingerDown(rows[0].viewport)
        fingerMove(rows[0].viewport, 0, 40)
        fingerUp(rows[0].viewport)
        fireEvent.wheel(rows[0].viewport, { deltaX: 0, deltaY: 60 })
        for (const { viewport } of rows) {
          expect(listeners.count(viewport)).toBe(1)
        }
      } finally {
        listeners.restore()
      }
    })

    test('is never attached to a static strip, which cannot be handed over', () => {
      setReducedMotion(true)
      const listeners = countWheelListeners()
      try {
        const { rows } = renderLaidOutRows()
        for (const { viewport } of rows) {
          expect(listeners.count(viewport)).toBe(0)
        }
      } finally {
        listeners.restore()
      }
    })

    test('is attached once a static strip starts to move, and taken off when it stops', () => {
      // Happy DOM answers the query from its settings but sends no change
      // event when they change, so the test sends the one a browser would,
      // on the lists the component asked for.
      const queries: MediaQueryList[] = []
      const realMatchMedia = window.matchMedia
      const spy = spyOn(window, 'matchMedia').mockImplementation(query => {
        const list = realMatchMedia.call(window, query)
        queries.push(list)
        return list
      })
      const changeMotion = (reduce: boolean) => {
        setReducedMotion(reduce)
        act(() => {
          for (const list of queries) list.dispatchEvent(new Event('change'))
        })
      }
      setReducedMotion(true)
      const listeners = countWheelListeners()
      try {
        const { rows } = renderLaidOutRows()
        changeMotion(false)
        for (const { viewport } of rows) {
          expect(listeners.count(viewport)).toBe(1)
        }
        changeMotion(true)
        for (const { viewport } of rows) {
          expect(listeners.count(viewport)).toBe(0)
        }
      } finally {
        listeners.restore()
        spy.mockRestore()
      }
    })

    test('comes off both rows when a drag hands them over', () => {
      const listeners = countWheelListeners()
      try {
        const { rows } = renderLaidOutRows()
        for (const { viewport } of rows) {
          expect(listeners.count(viewport)).toBe(1)
        }
        dragSideways(rows[1].viewport)
        for (const { viewport } of rows) {
          expect(listeners.count(viewport)).toBe(0)
        }
      } finally {
        listeners.restore()
      }
    })

    test('comes off the other row at a wheel hand-over, and off the steering row once its gesture ends', () => {
      // The row the wheel is over keeps steering the rest of that gesture,
      // which needs its listener; the next gesture is the browser's.
      const listeners = countWheelListeners()
      try {
        const { rows } = renderLaidOutRows()
        const [first, second] = rows
        wheelAt(first.viewport, 1000, { deltaX: 40, deltaY: 0 })
        expect(listeners.count(second.viewport)).toBe(0)
        expect(listeners.count(first.viewport)).toBe(1)

        wheelAt(first.viewport, 1016, { deltaX: 20, deltaY: 0 })
        expect(listeners.count(first.viewport)).toBe(1)

        wheelAt(first.viewport, 1016 + WHEEL_GESTURE_GAP_MS + 1, {
          deltaX: 20,
          deltaY: 0,
        })
        expect(listeners.count(first.viewport)).toBe(0)
      } finally {
        listeners.restore()
      }
    })

    test('stays on a row that could not be handed over, which a later wheel still hands over', () => {
      const listeners = countWheelListeners()
      try {
        const { rows } = renderLaidOutRows(0.3)
        const [first, second] = rows
        second.track.getAnimations = () => []
        dragSideways(first.viewport)
        expect(listeners.count(first.viewport)).toBe(0)
        expect(listeners.count(second.viewport)).toBe(1)

        second.track.getAnimations = () => [runningLoop(0.6)]
        wheelAt(second.viewport, 5000, { deltaX: 40, deltaY: 0 })
        expect(isHandedOver(second.viewport)).toBe(true)
      } finally {
        listeners.restore()
      }
    })
  })

  describe('never resumes', () => {
    test('losing focus leaves a handed-over row frozen, touched or not', () => {
      // The focus path thaws a row on blur; a row handed over to the visitor
      // must not come back to life because a pill in it lost focus, and
      // that includes the row the touch was not on.
      const { rows } = renderLaidOutRows()
      const [first] = rows
      dragSideways(first.viewport)
      for (const { viewport } of rows) {
        announcedPills(viewport)[0].focus()
        ;(document.activeElement as HTMLElement).blur()
      }

      for (const { viewport, track } of rows) {
        expect(track.dataset.frozen).toBe('true')
        expect(isHandedOver(viewport)).toBe(true)
      }
    })

    test('a later touch or wheel on either row does not move a row the visitor has scrolled', () => {
      const { rows } = renderLaidOutRows()
      dragSideways(rows[0].viewport)
      const scrolled = rows.map(({ viewport }, index) => {
        viewport.scrollLeft = 1234 + index
        return viewport.scrollLeft
      })

      for (const { viewport } of rows) {
        dragSideways(viewport)
        fireEvent.wheel(viewport, { deltaX: 30, deltaY: 0 })
      }
      rows.forEach(({ viewport }, index) => {
        expect(viewport.scrollLeft).toBe(scrolled[index])
      })
    })

    test('no timer is set that could start the row again', () => {
      const { rows } = renderLaidOutRows()
      const timers = spyOn(globalThis, 'setTimeout')
      try {
        dragSideways(rows[0].viewport)
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
    dragSideways(first.viewport)
    first.viewport.scrollLeft = 20 * PILL_PITCH - cutOf(first.track)

    const pill = announcedPills(first.viewport)[1]
    expect(isClearOfFades(first, pill)).toBe(false)
    pill.focus()

    expect(fadeOf(first.viewport)).toBeGreaterThan(0)
    expect(isClearOfFades(first, pill)).toBe(true)
    // As little as that takes: its start is at the left fade.
    expect(pill.offsetLeft - positionOf(first)).toBe(fadeOf(first.viewport))

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
      dragSideways(viewport)
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

describe('every question at once, as a list (MTC-85)', () => {
  const GROUP_NAME = 'Starter questions'

  function starterGroup(): HTMLElement {
    return screen.getByRole('group', { name: GROUP_NAME })
  }

  /** The wrapper that holds both rows, hidden while the list is open. */
  function rowsWrapper(container: HTMLElement): HTMLElement {
    const wrapper = container.querySelector<HTMLElement>(
      '.starter-ticker-row'
    )?.parentElement
    if (!wrapper) throw new Error('the ticker rendered no rows')
    return wrapper
  }

  /**
   * The open list as a reader meets it: each heading, marked, followed by
   * its questions, in document order.
   */
  function listSequence(): string[] {
    const shown = [...starterGroup().children].filter(
      child => !child.hasAttribute('hidden')
    )
    return shown.flatMap(child =>
      [...child.querySelectorAll('h2, h3, button')].map(element =>
        element.tagName !== 'BUTTON'
          ? `# ${element.textContent}`
          : (element.textContent ?? '')
      )
    )
  }

  /**
   * What the list should read, worked out from the tags themselves rather
   * than from starterGroups, so a grouping bug cannot agree with itself.
   */
  function expectedSequence(): string[] {
    const tags: Partial<Record<string, string | null>> = STARTER_LIST_THEMES
    const themeOf = (question: string) => tags[question] ?? null
    const pool: readonly string[] = STARTER_QUESTIONS
    const headed = (heading: string, questions: readonly string[]) =>
      questions.length > 0 ? [`# ${heading}`, ...questions] : []
    return [
      ...FEATURED_THEMES.flatMap(theme =>
        headed(
          STARTER_THEME_HEADINGS[theme.key],
          pool.filter(question => themeOf(question) === theme.key)
        )
      ),
      ...headed(
        STARTER_UNTAGGED_HEADING,
        pool.filter(question => themeOf(question) === null)
      ),
    ]
  }

  test('the control counts the whole pool and starts closed', () => {
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)
    const control = listToggle()

    expect(control.tagName).toBe('BUTTON')
    expect(control.textContent).toBe(
      seeAllQuestionsLabel(STARTER_QUESTIONS.length)
    )
    expect(control.textContent).toContain(String(STARTER_QUESTIONS.length))
    expect(control.getAttribute('aria-expanded')).toBe('false')
  })

  test('opens and closes the list, keeping focus on the control', () => {
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)
    const control = listToggle()
    control.focus()

    fireEvent.click(control)
    expect(document.activeElement).toBe(control)
    expect(control.getAttribute('aria-expanded')).toBe('true')
    expect(control.textContent).toBe(SHOW_FEWER_LABEL)

    fireEvent.click(control)
    expect(document.activeElement).toBe(control)
    expect(control.getAttribute('aria-expanded')).toBe('false')
    expect(control.textContent).toBe(
      seeAllQuestionsLabel(STARTER_QUESTIONS.length)
    )
  })

  test('is reached before the pills, is drawn under them, and names what it controls', () => {
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)
    const control = listToggle()
    const group = starterGroup()

    expect(
      control.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(control.classList.contains('order-last')).toBe(true)
    expect(control.getAttribute('aria-controls')).toBe(group.id)
    // Outside the group: the stylesheet pauses the rows while focus is
    // anywhere inside it, and a focused control would hold them still.
    expect(group.contains(control)).toBe(false)
    // First in the DOM, it would be the scroll anchor a browser picks, and
    // opening the list would scroll the page by the list's height.
    expect(control.classList.contains('[overflow-anchor:none]')).toBe(true)
  })

  test('shows every question once, grouped by theme in the featuring order, the untagged last', () => {
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)
    fireEvent.click(listToggle())

    expect(listSequence()).toEqual(expectedSequence())
    const announced = questionPills().map(pill => pill.textContent)
    expect(announced).toHaveLength(STARTER_QUESTIONS.length)
    expect(new Set(announced)).toEqual(new Set(STARTER_QUESTIONS))
    // Still the one named group, now holding the list.
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  test("draws Matt's groups: 3, 3, 5 and 5 under the themes, then 11 under More", () => {
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)
    fireEvent.click(listToggle())

    // Each heading, with the number of pills drawn under it before the next.
    const counts: [string, number][] = []
    for (const entry of listSequence()) {
      if (entry.startsWith('# ')) counts.push([entry.slice(2), 0])
      else counts[counts.length - 1][1] += 1
    }
    expect(counts).toEqual([
      ...FEATURED_THEMES.map((theme, index): [string, number] => [
        STARTER_THEME_HEADINGS[theme.key],
        [3, 3, 5, 5][index],
      ]),
      // Plus any question added since and not yet placed, which Matt's
      // decision lists under More until he places it.
      [
        STARTER_UNTAGGED_HEADING,
        11 +
          STARTER_QUESTIONS.filter(
            question => !Object.hasOwn(STARTER_LIST_THEMES, question)
          ).length,
      ],
    ])
  })

  /** The headings the open list shows, in the order it shows them. */
  function expectedHeadings(): string[] {
    return expectedSequence()
      .filter(entry => entry.startsWith('# '))
      .map(entry => entry.slice(2))
  }

  test.each([2, 3] as const)(
    'each theme is labeled by a real heading, at the level the surface passes (%i)',
    level => {
      // MTC-97: a screen-reader visitor jumps between themes by heading.
      // The level is one below the surface's own heading for the
      // assistant, which is why the surface passes it.
      render(<StarterTicker listHeadingLevel={level} onPick={() => {}} />)
      fireEvent.click(listToggle())

      const headings = within(starterGroup()).getAllByRole('heading')
      expect(headings.map(heading => heading.textContent)).toEqual(
        expectedHeadings()
      )
      for (const heading of headings) {
        expect(heading.tagName).toBe(`H${level}`)
      }
      // Headings take no focus, so the tab order is still the pills'.
      expect(headings.every(heading => heading.tabIndex < 0)).toBe(true)
      expect(screen.getAllByRole('group')).toHaveLength(1)
    }
  )

  test("labels in Matt's style: 14 px, semibold, sentence case, the foreground color", () => {
    // Matt, 2026-09-28 (MTC-97): at the pills' scale and in the main text
    // color, not 11 px muted capitals.
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)
    fireEvent.click(listToggle())

    for (const heading of within(starterGroup()).getAllByRole('heading')) {
      const classes = [...heading.classList]
      expect(classes).toEqual(
        expect.arrayContaining([
          'text-sm',
          'leading-[1.3]',
          'font-semibold',
          'text-foreground',
        ])
      )
      expect(classes).not.toContain('uppercase')
      expect(classes).not.toContain('capitalize')
      expect(classes).not.toContain('text-muted-foreground')
      expect(classes.some(name => name.startsWith('tracking-'))).toBe(false)
      expect(classes.some(name => name.startsWith('text-['))).toBe(false)
      // Sentence case comes from the strings themselves: a capital first
      // word, then lowercase words, with acronyms ("AI") left whole.
      const [first = '', ...rest] = (heading.textContent ?? '').split(' ')
      expect(first.charAt(0)).toBe(first.charAt(0).toUpperCase())
      expect(first.slice(1)).toBe(first.slice(1).toLowerCase())
      for (const word of rest) {
        expect([word.toLowerCase(), word.toUpperCase()]).toContain(word)
      }
    }
  })

  test('spaces the groups by proximity: more above a label than below it', () => {
    // 1.5 rem between groups, 0.5 rem from a label to its pills, so a label
    // belongs to the questions under it. The first label has no extra space
    // of its own: it opens the list where the rows began.
    render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)
    fireEvent.click(listToggle())

    const headings = within(starterGroup()).getAllByRole('heading')
    const list = headings[0]?.parentElement?.parentElement
    expect(list?.classList.contains('gap-6')).toBe(true)
    for (const heading of headings) {
      expect(heading.parentElement?.classList.contains('gap-2')).toBe(true)
      expect(heading.className).not.toMatch(/\b-?[mp][xytblrse]?-/)
    }
  })

  test('hides the rows while the list is open, and shows them again after', () => {
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} />
    )
    const wrapper = rowsWrapper(container)
    expect(wrapper.querySelectorAll('.starter-ticker-row')).toHaveLength(2)

    fireEvent.click(listToggle())
    expect(wrapper.hidden).toBe(true)

    fireEvent.click(listToggle())
    expect(wrapper.hidden).toBe(false)
    expect(listSequence()).not.toContain(`# ${STARTER_UNTAGGED_HEADING}`)
  })

  test('a pick from the list asks its question', () => {
    const picked: string[] = []
    render(
      <StarterTicker
        listHeadingLevel={2}
        onPick={question => picked.push(question)}
      />
    )
    fireEvent.click(listToggle())

    const last = STARTER_QUESTIONS[STARTER_QUESTIONS.length - 1]
    fireEvent.click(within(starterGroup()).getByRole('button', { name: last }))
    expect(picked).toEqual([last])
  })

  test('a pick from the list is told apart by touch, as a pick from the rows is', () => {
    // The surfaces read how a question was picked off the region around
    // the ticker (pointer.ts, MTC-74 and MTC-81), so the list has to sit
    // inside it: the press decides, and the device only when none was seen.
    const picks: { question: string; touch: boolean }[] = []
    function Surface() {
      const { pressHandlers, activatedByTouch } = useActivationPress()
      return (
        <div {...pressHandlers}>
          <StarterTicker
            listHeadingLevel={2}
            onPick={question =>
              picks.push({ question, touch: activatedByTouch() })
            }
          />
        </div>
      )
    }
    setTouchDevice(true)
    try {
      render(<Surface />)
      fireEvent.click(listToggle())
      const pill = within(starterGroup()).getByRole('button', {
        name: STARTER_QUESTIONS[0],
      })

      fireEvent.pointerDown(pill, { pointerType: 'touch' })
      fireEvent.click(pill)
      fireEvent.pointerDown(pill, { pointerType: 'mouse' })
      fireEvent.click(pill)
      // A bare click, as a screen reader sends it: the device decides.
      fireEvent.click(pill)
      expect(picks.map(pick => pick.touch)).toEqual([true, false, true])
      expect(new Set(picks.map(pick => pick.question))).toEqual(
        new Set([STARTER_QUESTIONS[0]])
      )
    } finally {
      setTouchDevice(false)
    }
  })

  test('rows that were moving stop while the list is open and move again from where they were', () => {
    const progress = [0.37, 0.71] as const
    const rows = renderMovingRows({ progress })
    const offsetOf = (track: HTMLElement) =>
      track.style.getPropertyValue('--ticker-offset')
    for (const { track } of rows) {
      expect(offsetOf(track)).not.toBe(String(progress[0]))
      expect(offsetOf(track)).not.toBe(String(progress[1]))
    }

    fireEvent.click(listToggle())
    // The offset a hidden row's animation restarts from is where its loop
    // had got to when the list opened.
    rows.forEach(({ track }, index) => {
      expect(offsetOf(track)).toBe(String(progress[index]))
    })
    // Hidden, a track runs no animation.
    for (const { track } of rows) track.getAnimations = () => []

    fireEvent.click(listToggle())
    rows.forEach(({ viewport, track }, index) => {
      expect(track.dataset.frozen).toBeUndefined()
      expect(viewport.dataset.handedOver).toBeUndefined()
      expect(offsetOf(track)).toBe(String(progress[index]))
    })
  })

  test('a row held still for focus when the list opens moves again from the pill it showed', () => {
    // An activation that leaves focus on a pill (a script, or assistive
    // technology that does not move focus) opens the list over a frozen
    // row. Hidden, its blur would read a dropped scroll position; closing
    // would then scroll a row that is moving again.
    const rows = renderMovingRows({ progress: 0.25 })
    const [first] = rows
    const pill = announcedPills(first.viewport)[2]
    pill.focus()
    expect(first.track.dataset.frozen).toBe('true')
    first.viewport.scrollLeft = 240
    const shownAt = progressForScrollLeft(240, COPY_WIDTH_MEASURED, 0)

    fireEvent.click(listToggle())
    expect(first.track.dataset.frozen).toBeUndefined()
    expect(first.viewport.scrollLeft).toBe(0)
    expect(first.track.style.getPropertyValue('--ticker-offset')).toBe(
      String(shownAt)
    )
    pill.blur()
    first.track.getAnimations = () => []

    fireEvent.click(listToggle())
    expect(first.track.dataset.frozen).toBeUndefined()
    expect(first.viewport.scrollLeft).toBe(0)
    expect(first.track.style.getPropertyValue('--ticker-offset')).toBe(
      String(shownAt)
    )
  })

  test('static strips under reduced motion get their scroll back when the list closes', () => {
    // Nothing animates the toggle in any mode, so it is as immediate here
    // as anywhere; what reduced motion changes is that the rows are strips
    // with their own scroll positions to keep.
    setReducedMotion(true)
    const { container } = render(
      <StarterTicker listHeadingLevel={2} onPick={() => {}} />
    )
    const { rows } = tickerOf(container)
    rows[0].viewport.scrollLeft = 90
    rows[1].viewport.scrollLeft = 30

    fireEvent.click(listToggle())
    expect(rowsWrapper(container).hidden).toBe(true)
    expect(listSequence()).toEqual(expectedSequence())
    for (const { viewport } of rows) viewport.scrollLeft = 0

    fireEvent.click(listToggle())
    expect(rows[0].viewport.scrollLeft).toBe(90)
    expect(rows[1].viewport.scrollLeft).toBe(30)
    for (const { track } of rows) {
      expect(track.dataset.frozen).toBeUndefined()
    }
  })

  test('closing the list keeps the rows and the control on screen, opening it scrolls nothing', () => {
    const scrolled: Element[] = []
    const realScrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
    try {
      render(<StarterTicker listHeadingLevel={2} onPick={() => {}} />)
      const control = listToggle()
      expect(scrolled).toEqual([])

      fireEvent.click(control)
      expect(scrolled).toEqual([])

      fireEvent.click(control)
      // The whole ticker, rows and control together.
      const ticker = control.parentElement
      if (!ticker) throw new Error('the control has no ticker around it')
      expect(scrolled).toEqual([ticker])
      expect(ticker.contains(starterGroup())).toBe(true)
      expect(ticker.className).toContain('scroll-mt-(--nav-height)')
    } finally {
      Element.prototype.scrollIntoView = realScrollIntoView
    }
  })
})
