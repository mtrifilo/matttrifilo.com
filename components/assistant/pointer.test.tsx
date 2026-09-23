import { afterEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import { setTouchDevice } from '@/test/touch-device'
import { hasCoarsePointer, isTouchPick, usePickPointer } from './pointer'

/**
 * How a pick is told to be a touch, which decides whether the composer is
 * focused after it (a focused composer raises a phone's keyboard over the
 * answer).
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

describe('a pick', () => {
  test('is a touch on a touch device, whatever pressed it', () => {
    setTouchDevice(true)
    expect(isTouchPick('touch')).toBe(true)
    expect(isTouchPick('mouse')).toBe(true)
    expect(isTouchPick(null)).toBe(true)
  })

  test('falls back on the press on a fine-pointer device', () => {
    // A touchscreen laptop reports a fine pointer and still raises an
    // on-screen keyboard for a tapped field.
    expect(isTouchPick('touch')).toBe(true)
    expect(isTouchPick('mouse')).toBe(false)
    expect(isTouchPick('pen')).toBe(false)
    expect(isTouchPick(null)).toBe(false)
  })

  test('falls back on the press when the browser cannot say', () => {
    withoutMatchMedia(() => {
      expect(isTouchPick('touch')).toBe(true)
      expect(isTouchPick('mouse')).toBe(false)
      expect(isTouchPick(null)).toBe(false)
    })
  })
})

describe('the press a pick came from', () => {
  function Region({ onPick }: { onPick: (touch: boolean) => void }) {
    const { pressHandlers, pickedByTouch } = usePickPointer()
    return (
      <div {...pressHandlers}>
        <button onClick={() => onPick(pickedByTouch())} type="button">
          pill
        </button>
      </div>
    )
  }

  function renderRegion() {
    const picks: boolean[] = []
    render(<Region onPick={touch => picks.push(touch)} />)
    return { pill: screen.getByRole('button'), picks }
  }

  test('is a touch after a finger pressed it', () => {
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'touch' })
    fireEvent.click(pill)
    expect(picks).toEqual([true])
  })

  test('is not a touch after a mouse pressed it', () => {
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'mouse' })
    fireEvent.click(pill)
    expect(picks).toEqual([false])
  })

  test('is not a touch when a key follows an earlier tap', () => {
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'touch' })
    fireEvent.keyDown(pill, { key: 'Enter' })
    fireEvent.click(pill)
    expect(picks).toEqual([false])
  })

  test('is not a touch when a click with no press follows an earlier tap', () => {
    // A screen reader or voice control sends a click with no press. The tap
    // before it produced its own click and is forgotten.
    const { pill, picks } = renderRegion()
    fireEvent.pointerDown(pill, { pointerType: 'touch' })
    fireEvent.click(pill)
    fireEvent.click(pill)
    expect(picks).toEqual([true, false])
  })

  test('is not a touch when nothing pressed it', () => {
    const { pill, picks } = renderRegion()
    fireEvent.click(pill)
    expect(picks).toEqual([false])
  })
})
