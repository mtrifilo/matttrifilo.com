import { afterEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import { STARTER_QUESTIONS } from './copy'
import { StarterTicker } from './starter-ticker'
import {
  TICKER_ANIMATION_NAME,
  TICKER_COPIES,
  tickerRows,
} from './ticker-geometry'

/**
 * The starter ticker's two rows as they are rendered (MTC-55).
 *
 * The rows' arithmetic is tested in ticker-geometry.test.ts and their
 * contract with the stylesheet in lib/ticker-css.test.ts. What neither can
 * see is the markup: which row each question lands in, how many copies of a
 * row exist, which of them a screen reader and the tab key meet, and which
 * state the component itself writes for the stylesheet to read.
 *
 * Nothing here asserts motion or position. Happy DOM runs no animations and
 * lays nothing out, so every pill measures zero wide; the speed, the pause
 * and where a focused pill lands are preview checks. Where a behaviour only
 * starts once a row is moving, the test states a running loop and a measured
 * width itself, and asserts the flag the component writes, never what the
 * browser would then draw.
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
 * The group the stylesheet's hover, focus and touch rules are anchored on,
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

describe('holding the rows still', () => {
  test('a touch marks the pause on the group, which stops both rows', () => {
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { group, rows } = tickerOf(container)

    expect(group.dataset.touched).toBeUndefined()
    fireEvent.touchStart(rows[1].viewport)
    // The attribute, not the animation: lib/ticker-css.test.ts pins the rule
    // that reads it, and a browser is what applies the two together.
    expect(group.dataset.touched).toBe('true')
  })

  test('a visitor who asked for no motion gets no touch pause either', () => {
    // There is nothing to pause, and marking rows that are not moving would
    // leave a stale attribute behind for the reduced-motion rules to fight.
    setReducedMotion(true)
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { group, rows } = tickerOf(container)

    fireEvent.touchStart(rows[0].viewport)
    expect(group.dataset.touched).toBeUndefined()
  })

  test('a focused pill leaves a row that has not been measured alone', () => {
    // Without a copy width the loop's position cannot be converted into a
    // scroll offset, and freezing anyway would move the row wrongly.
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const [first] = tickerOf(container).rows

    screen.getAllByRole('button')[0].focus()
    expect(first.track.dataset.frozen).toBeUndefined()
  })
})

describe('a moving row, while a pill has focus', () => {
  const COPY_WIDTH = 600
  const REAL_BOUNDING_RECT = Element.prototype.getBoundingClientRect

  afterEach(() => {
    Element.prototype.getBoundingClientRect = REAL_BOUNDING_RECT
  })

  /**
   * Render rows that believe they are moving.
   *
   * Each row measures one copy of its questions when it mounts, and only a
   * row with a measured width and a running loop has a position to hand
   * over, so both are stated: the copy's width before the render, and the
   * browser's animation on each track after it.
   */
  function renderMovingRows() {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = REAL_BOUNDING_RECT.call(this)
      if (!this.classList.contains('starter-ticker-copy')) return rect
      return { ...rect.toJSON(), width: COPY_WIDTH } as DOMRect
    }
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { rows } = tickerOf(container)
    const loop = {
      animationName: TICKER_ANIMATION_NAME,
      effect: { getComputedTiming: () => ({ progress: 0.25 }) },
    } as unknown as Animation
    for (const { track } of rows) track.getAnimations = () => [loop]
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
