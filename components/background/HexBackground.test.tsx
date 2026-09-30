import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { act, render } from '@testing-library/react'
import { HexBackground } from './HexBackground'

/**
 * The component's side of the deferred start (MTC-102): until the browser
 * reports an idle moment after load, the honeycomb measures nothing, asks
 * for no context and schedules no frame. start-when-idle.test.ts covers the
 * timing policy itself.
 */
describe('HexBackground waits for idle before any canvas work (MTC-102)', () => {
  type Idle = typeof window.requestIdleCallback
  type CancelIdle = typeof window.cancelIdleCallback
  let pendingIdle: Map<number, () => void>
  let original: { request: Idle; cancel: CancelIdle }

  beforeEach(() => {
    pendingIdle = new Map()
    original = {
      request: window.requestIdleCallback,
      cancel: window.cancelIdleCallback,
    }
    let nextHandle = 1
    window.requestIdleCallback = ((callback: IdleRequestCallback) => {
      const handle = nextHandle++
      pendingIdle.set(handle, () =>
        callback({ didTimeout: false, timeRemaining: () => 50 })
      )
      return handle
    }) as Idle
    window.cancelIdleCallback = ((handle: number) => {
      pendingIdle.delete(handle)
    }) as CancelIdle
    if (document.readyState !== 'complete') {
      window.dispatchEvent(new Event('load'))
    }
  })

  afterEach(() => {
    window.requestIdleCallback = original.request
    window.cancelIdleCallback = original.cancel
  })

  function runIdle() {
    act(() => {
      for (const [handle, run] of [...pendingIdle]) {
        pendingIdle.delete(handle)
        run()
      }
    })
  }

  test('mounting asks for no context and no frame; the idle callback starts both', () => {
    const getContext = spyOn(HTMLCanvasElement.prototype, 'getContext')
    const frame = spyOn(window, 'requestAnimationFrame')
    try {
      const { unmount } = render(<HexBackground />)
      expect(getContext).not.toHaveBeenCalled()
      expect(frame).not.toHaveBeenCalled()
      expect(pendingIdle.size).toBe(1)

      runIdle()
      expect(getContext).toHaveBeenCalled()
      expect(frame).toHaveBeenCalled()
      unmount()
    } finally {
      getContext.mockRestore()
      frame.mockRestore()
    }
  })

  test('unmounted before idle: the start is withdrawn and never runs', () => {
    const getContext = spyOn(HTMLCanvasElement.prototype, 'getContext')
    try {
      const { unmount } = render(<HexBackground />)
      expect(pendingIdle.size).toBe(1)
      unmount()
      expect(pendingIdle.size).toBe(0)
      expect(getContext).not.toHaveBeenCalled()
    } finally {
      getContext.mockRestore()
    }
  })
})
