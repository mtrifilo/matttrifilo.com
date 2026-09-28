import { afterEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import { setTouchDevice } from '@/test/touch-device'
import {
  hasCoarsePointer,
  isTouchActivation,
  useActivationPress,
} from './pointer'

/**
 * How an activation is told to be a touch, which decides whether the
 * composer is focused after it (a focused composer raises a phone's keyboard
 * over the page). The press decides; the device only when there was none.
 *
 * A touch device is stated through Happy DOM's settings (test/touch-device.ts);
 * `matchMedia` is removed only to test the fallback when it is missing.
 */

afterEach(() => {
  setTouchDevice(false)
})

/**
 * Runs with `matchMedia` missing, as an old browser or a locked-down
 * embedding has it. This is the one case the device settings cannot state.
 */
function withoutMatchMedia(run: () => void): void {
  const real = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: undefined,
  })
  try {
    run()
  } finally {
    if (real) Object.defineProperty(window, 'matchMedia', real)
    else delete (window as { matchMedia?: unknown }).matchMedia
  }
}

describe('the device pointer', () => {
  test('is coarse on a touch device and fine elsewhere', () => {
    setTouchDevice(true)
    expect(hasCoarsePointer()).toBe(true)
    setTouchDevice(false)
    expect(hasCoarsePointer()).toBe(false)
  })

  test('reads as fine when the browser cannot say', () => {
    withoutMatchMedia(() => expect(hasCoarsePointer()).toBe(false))
  })
})

describe('an activation', () => {
  test('is a touch when a finger pressed it, on any device', () => {
    expect(isTouchActivation('touch')).toBe(true)
    setTouchDevice(true)
    expect(isTouchActivation('touch')).toBe(true)
  })

  test('is not a touch when a mouse, a pen or a key pressed it, even on a touch device', () => {
    // The press wins over the device (Matt, 2026-09-23, MTC-81): only a
    // touch counts as one, so a pen does not either.
    setTouchDevice(true)
    expect(isTouchActivation('mouse')).toBe(false)
    expect(isTouchActivation('pen')).toBe(false)
    expect(isTouchActivation('keyboard')).toBe(false)
  })

  test('is not a touch when a pointer a browser names otherwise pressed it', () => {
    setTouchDevice(true)
    expect(isTouchActivation('-vendor-wand')).toBe(false)
  })

  test('is decided by the device when nothing pressed it', () => {
    // A screen reader or voice control activates with a bare click.
    setTouchDevice(true)
    expect(isTouchActivation(null)).toBe(true)
    setTouchDevice(false)
    expect(isTouchActivation(null)).toBe(false)
  })

  test('is not a touch when nothing pressed it and the browser cannot say', () => {
    withoutMatchMedia(() => {
      expect(isTouchActivation(null)).toBe(false)
      expect(isTouchActivation('touch')).toBe(true)
    })
  })
})

describe('the press an activation came from', () => {
  function Region({ onPick }: { onPick: (touch: boolean) => void }) {
    const { pressHandlers, activatedByTouch } = useActivationPress()
    return (
      <div {...pressHandlers}>
        <textarea aria-label="composer" />
        <button onClick={() => onPick(activatedByTouch())} type="button">
          pill
        </button>
      </div>
    )
  }

  function renderRegion() {
    const picks: boolean[] = []
    render(<Region onPick={touch => picks.push(touch)} />)
    return {
      composer: screen.getByRole('textbox'),
      pill: screen.getByRole('button'),
      picks,
    }
  }

  test('is a touch after a finger pressed it', () => {
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'touch' })
    fireEvent.click(pill)
    expect(picks).toEqual([true])
  })

  test('is not a touch after a mouse pressed it on a touch device', () => {
    setTouchDevice(true)
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'mouse' })
    fireEvent.click(pill)
    expect(picks).toEqual([false])
  })

  test('is not a touch after a pen pressed it on a touch device', () => {
    setTouchDevice(true)
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'pen' })
    fireEvent.click(pill)
    expect(picks).toEqual([false])
  })

  test('is not a touch after Enter or Space on it on a touch device', () => {
    setTouchDevice(true)
    const { pill, picks } = renderRegion()
    fireEvent.keyDown(pill, { key: 'Enter' })
    fireEvent.click(pill)
    fireEvent.keyDown(pill, { key: ' ' })
    fireEvent.click(pill)
    expect(picks).toEqual([false, false])
  })

  test('is not a touch when a key follows an earlier tap', () => {
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'touch' })
    fireEvent.keyDown(pill, { key: 'Enter' })
    fireEvent.click(pill)
    expect(picks).toEqual([false])
  })

  test('is decided by the device when a click with no press follows an earlier tap', () => {
    // A screen reader or voice control sends a click with no press. The tap
    // before it produced its own click and is forgotten.
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'touch' })
    fireEvent.click(pill)
    fireEvent.click(pill)
    expect(picks).toEqual([true, false])
  })

  test('is decided by the device when a click with no press follows Enter pressed elsewhere', () => {
    // Enter in the composer sends a typed question and produces no click on
    // a pill, so it must not stand in for the press of a later bare click.
    setTouchDevice(true)
    const { composer, pill, picks } = renderRegion()
    fireEvent.keyDown(composer, { key: 'Enter' })
    fireEvent.click(pill)
    expect(picks).toEqual([true])
  })

  test('is decided by the device when a click with no press follows a cancelled touch', () => {
    // A touch that became a scroll produces no click, so it must not stand
    // in for the press of a later bare click.
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'touch' })
    fireEvent.pointerCancel(pill, { pointerType: 'touch' })
    fireEvent.click(pill)
    setTouchDevice(true)
    fireEvent.pointerDown(pill, { pointerType: 'pen' })
    fireEvent.pointerCancel(pill, { pointerType: 'pen' })
    fireEvent.click(pill)
    expect(picks).toEqual([false, true])
  })

  test('is decided by the device when a key other than Enter or Space came last', () => {
    setTouchDevice(true)
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'mouse' })
    fireEvent.keyDown(pill, { key: 'Tab' })
    fireEvent.click(pill)
    expect(picks).toEqual([true])
  })

  test('is decided by the device when nothing pressed it', () => {
    const { pill, picks } = renderRegion()
    fireEvent.click(pill)
    setTouchDevice(true)
    fireEvent.click(pill)
    expect(picks).toEqual([false, true])
  })
})
