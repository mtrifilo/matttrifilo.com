import { afterEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import { STARTER_QUESTIONS } from './copy'
import { StarterTicker } from './starter-ticker'
import { TICKER_COPIES } from './ticker-geometry'

/**
 * The starter ticker as it is rendered (MTC-59).
 *
 * The row's arithmetic is tested in ticker-geometry.test.ts and its contract
 * with the stylesheet in lib/ticker-css.test.ts. What neither can see is the
 * markup: how many copies of the pool exist, which of them a screen reader
 * and the tab key meet, and which state the component itself writes for the
 * stylesheet to read.
 *
 * Nothing here asserts motion or position. Happy DOM runs no animations and
 * lays nothing out, so every pill measures zero wide; the speed, the pause
 * and where a focused pill lands are preview checks, and the two behaviours
 * below are the ones that exist without a layout.
 */

const REAL_MATCH_MEDIA = window.matchMedia

/**
 * Answer the reduced-motion query the way a visitor's setting would.
 *
 * Happy DOM's own `matchMedia` reports every query as unmatched, so the one
 * media feature the component branches on has to be stated.
 */
function setReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = REAL_MATCH_MEDIA
})

/** The row the stylesheet's hover, focus and touch rules are anchored on. */
function rowOf(container: HTMLElement) {
  const viewport = container.querySelector<HTMLElement>('.starter-ticker')
  const track = container.querySelector<HTMLElement>('.starter-ticker-track')
  if (!viewport || !track) throw new Error('the ticker rendered no row')
  return { viewport, track }
}

describe('the questions the ticker offers', () => {
  test('announces every question in the pool exactly once', () => {
    render(<StarterTicker onPick={() => {}} />)

    // By role, so this counts what a screen reader and the tab key reach:
    // the trailing copies are aria-hidden and are not in the tree. A copy
    // that lost its aria-hidden would read as the pool said twice, which is
    // the failure no other test here would notice.
    const pills = screen.getAllByRole('button')
    expect(pills.map(pill => pill.textContent)).toEqual([...STARTER_QUESTIONS])
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

  test('lays the pool down once more, silently, for the loop to wrap into', () => {
    const { container } = render(<StarterTicker onPick={() => {}} />)

    const copies = container.querySelectorAll('.starter-ticker-copy')
    // The keyframe travels 100 / TICKER_COPIES percent of the track, so the
    // seam is invisible only while the track holds exactly this many.
    expect(copies).toHaveLength(TICKER_COPIES)
    const hidden = container.querySelectorAll(
      '.starter-ticker-copy[aria-hidden="true"]'
    )
    expect(hidden).toHaveLength(TICKER_COPIES - 1)
    expect(container.querySelectorAll('button')).toHaveLength(
      TICKER_COPIES * STARTER_QUESTIONS.length
    )
  })

  test('a pill in a silent copy still asks its question', () => {
    // The trailing copy is what the row shows while the loop wraps, so it is
    // under the cursor for much of every loop. Hidden from assistive tech,
    // never dead to a click.
    const picked: string[] = []
    const { container } = render(<StarterTicker onPick={q => picked.push(q)} />)

    const hiddenCopy = container.querySelector(
      '.starter-ticker-copy[aria-hidden="true"]'
    )
    const pill = hiddenCopy?.querySelector('button')
    if (!pill) throw new Error('the silent copy rendered no pills')
    expect(pill.getAttribute('tabindex')).toBe('-1')

    fireEvent.click(pill)
    expect(picked).toEqual([STARTER_QUESTIONS[0]])
  })
})

describe('holding the row still', () => {
  test('a touch marks the pause the stylesheet reads', () => {
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { viewport, track } = rowOf(container)

    expect(track.dataset.touched).toBeUndefined()
    fireEvent.touchStart(viewport)
    // The attribute, not the animation: lib/ticker-css.test.ts pins the rule
    // that reads it, and a browser is what applies the two together.
    expect(track.dataset.touched).toBe('true')
  })

  test('a visitor who asked for no motion gets no touch pause either', () => {
    // There is nothing to pause, and marking a row that is not moving would
    // leave a stale attribute behind for the reduced-motion rules to fight.
    setReducedMotion(true)
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { viewport, track } = rowOf(container)

    fireEvent.touchStart(viewport)
    expect(track.dataset.touched).toBeUndefined()
  })

  test('hover and focus are the stylesheet to pause, and it has the markup for it', () => {
    // `.starter-ticker:hover` and `.starter-ticker:focus-within` pause the
    // track; nothing in the component toggles for either, so what it owes
    // those rules is the two classes and the nesting between them. Happy DOM
    // resolves neither pseudo-class, which is why the focused state is
    // checked as containment instead.
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { viewport, track } = rowOf(container)

    expect(viewport.classList.contains('edge-faded-row')).toBe(true)
    expect(viewport.contains(track)).toBe(true)

    screen.getAllByRole('button')[0].focus()
    expect(viewport.contains(document.activeElement)).toBe(true)
  })

  test('a focused pill leaves an unmoving row alone', () => {
    // The freeze exists to hand a moving track's position over to
    // scrollLeft. With no animation running there is no transform to
    // replace, and writing the flag anyway would drop an animation that a
    // browser had not started yet.
    const { container } = render(<StarterTicker onPick={() => {}} />)
    const { track } = rowOf(container)

    screen.getAllByRole('button')[0].focus()
    expect(track.dataset.frozen).toBeUndefined()
  })
})
