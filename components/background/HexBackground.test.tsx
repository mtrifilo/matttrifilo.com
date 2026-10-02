import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { act, render } from '@testing-library/react'
import { HexBackground } from './HexBackground'
import { START_FALLBACK_DELAY_MS } from './start-when-idle'
import { setTouchDevice } from '@/test/touch-device'

/**
 * The component's side of the start (MTC-102; Matt, 2026-10-01). On
 * a phone, until the browser reports an idle moment after load, the
 * honeycomb measures nothing, asks for no context and schedules no frame; on
 * a desktop it starts at mount. start-when-idle.test.ts covers the timing
 * policy itself; test/touch-device.ts says how the test DOM is made a phone.
 */
describe('HexBackground start (MTC-102)', () => {
  type Idle = typeof window.requestIdleCallback
  type CancelIdle = typeof window.cancelIdleCallback
  let pendingIdle: Map<number, () => void>
  let original: { request: Idle; cancel: CancelIdle }

  beforeEach(() => {
    setTouchDevice(true)
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
  })

  afterEach(() => {
    setTouchDevice(false)
    // Happy DOM has no idle callback of its own: put back exactly what was
    // there, which is usually nothing.
    const w = window as unknown as Record<string, unknown>
    if (original.request) window.requestIdleCallback = original.request
    else delete w.requestIdleCallback
    if (original.cancel) window.cancelIdleCallback = original.cancel
    else delete w.cancelIdleCallback
  })

  function runIdle() {
    act(() => {
      for (const [handle, run] of [...pendingIdle]) {
        pendingIdle.delete(handle)
        run()
      }
    })
  }

  test('on a phone, mounting asks for no context and no frame; the idle callback starts both', () => {
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

  test('on a phone, unmounted before idle: the start is withdrawn and never runs', () => {
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
  test('on a phone mounted while the document is still loading: it waits for load, then for idle', () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    })
    try {
      const { unmount } = render(<HexBackground />)
      expect(pendingIdle.size).toBe(0)
      act(() => {
        window.dispatchEvent(new Event('load'))
      })
      expect(pendingIdle.size).toBe(1)
      unmount()
    } finally {
      delete (document as unknown as Record<string, unknown>).readyState
    }
    expect(document.readyState).toBe('complete')
  })

  test('on a phone without requestIdleCallback it starts on the fallback timer', async () => {
    const w = window as unknown as Record<string, unknown>
    delete w.requestIdleCallback
    const getContext = spyOn(HTMLCanvasElement.prototype, 'getContext')
    try {
      const { unmount } = render(<HexBackground />)
      expect(getContext).not.toHaveBeenCalled()
      await act(
        () =>
          new Promise(resolve =>
            setTimeout(resolve, START_FALLBACK_DELAY_MS + 50)
          )
      )
      expect(getContext).toHaveBeenCalled()
      unmount()
    } finally {
      getContext.mockRestore()
    }
  })
  test('on a desktop it starts at mount: context and first frame, no idle wait', () => {
    setTouchDevice(false)
    const getContext = spyOn(HTMLCanvasElement.prototype, 'getContext')
    const frame = spyOn(window, 'requestAnimationFrame')
    const cancelFrame = spyOn(window, 'cancelAnimationFrame')
    try {
      const { unmount } = render(<HexBackground />)
      expect(getContext).toHaveBeenCalled()
      expect(frame).toHaveBeenCalled()
      expect(pendingIdle.size).toBe(0)
      unmount()
      // The drawing's own cleanup ran: the scheduled frame was cancelled.
      expect(cancelFrame).toHaveBeenCalled()
    } finally {
      getContext.mockRestore()
      frame.mockRestore()
      cancelFrame.mockRestore()
    }
  })
})
