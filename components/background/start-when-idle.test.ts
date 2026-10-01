import { describe, expect, test } from 'bun:test'
import {
  START_FALLBACK_DELAY_MS,
  START_IDLE_TIMEOUT_MS,
  START_LOAD_WAIT_CAP_MS,
  startWhenIdle,
  type StartHost,
} from './start-when-idle'

/** A host whose load event, idle callbacks and timers are fired by hand. */
function createHost({ loaded = false, idle = true } = {}) {
  let isLoaded = loaded
  let nextHandle = 1
  const loadListeners = new Set<() => void>()
  const idles = new Map<number, { run: () => void; timeoutMs: number }>()
  const timers = new Map<number, { run: () => void; delayMs: number }>()

  const host: StartHost = {
    isLoaded: () => isLoaded,
    onLoad(listener) {
      loadListeners.add(listener)
      return () => loadListeners.delete(listener)
    },
    requestIdle: idle
      ? (run, timeoutMs) => {
          const handle = nextHandle++
          idles.set(handle, { run, timeoutMs })
          return handle
        }
      : null,
    cancelIdle: handle => idles.delete(handle),
    setTimer(run, delayMs) {
      const handle = nextHandle++
      timers.set(handle, { run, delayMs })
      return handle
    },
    clearTimer: handle => timers.delete(handle),
  }

  return {
    host,
    load() {
      isLoaded = true
      for (const listener of [...loadListeners]) {
        loadListeners.delete(listener)
        listener()
      }
    },
    runIdle() {
      for (const [handle, entry] of [...idles]) {
        idles.delete(handle)
        entry.run()
      }
    },
    runTimers() {
      for (const [handle, entry] of [...timers]) {
        timers.delete(handle)
        entry.run()
      }
    },
    loadListeners: () => loadListeners.size,
    idles: () => [...idles.values()],
    timers: () => [...timers.values()],
  }
}

describe('the honeycomb starts after load, when the main thread is idle (MTC-102)', () => {
  test('nothing starts before the load event; only the load cap is armed', () => {
    const h = createHost()
    let started = 0
    startWhenIdle(h.host, () => started++)
    expect(started).toBe(0)
    expect(h.idles()).toEqual([])
    expect(h.timers().map(t => t.delayMs)).toEqual([START_LOAD_WAIT_CAP_MS])
  })

  test('load arriving first withdraws the cap', () => {
    const h = createHost()
    startWhenIdle(h.host, () => {})
    h.load()
    expect(h.timers()).toEqual([])
    expect(h.idles()).toHaveLength(1)
  })

  test('a load that never comes: the cap moves on to waiting for idle', () => {
    const h = createHost()
    let started = 0
    startWhenIdle(h.host, () => started++)
    h.runTimers()
    expect(h.loadListeners()).toBe(0)
    expect(h.idles()).toHaveLength(1)
    // A late load does not queue a second start.
    h.load()
    expect(h.idles()).toHaveLength(1)
    h.runIdle()
    expect(started).toBe(1)
  })

  test('cancelled before load: the load listener and the cap are both withdrawn', () => {
    const h = createHost()
    const cancel = startWhenIdle(h.host, () => {})
    cancel()
    expect(h.loadListeners()).toBe(0)
    expect(h.timers()).toEqual([])
  })

  test('load alone is not enough: it waits for an idle moment', () => {
    const h = createHost()
    let started = 0
    startWhenIdle(h.host, () => started++)
    h.load()
    expect(started).toBe(0)
    expect(h.idles()).toHaveLength(1)
    h.runIdle()
    expect(started).toBe(1)
  })

  test('the idle wait is capped, so a page that stays busy still gets its honeycomb', () => {
    const h = createHost()
    startWhenIdle(h.host, () => {})
    h.load()
    expect(h.idles()[0].timeoutMs).toBe(START_IDLE_TIMEOUT_MS)
  })

  test('mounted after load, it goes straight to waiting for idle', () => {
    const h = createHost({ loaded: true })
    let started = 0
    startWhenIdle(h.host, () => started++)
    expect(h.loadListeners()).toBe(0)
    expect(h.idles()).toHaveLength(1)
    h.runIdle()
    expect(started).toBe(1)
  })

  test('without requestIdleCallback it starts on a short timer after load', () => {
    const h = createHost({ idle: false })
    let started = 0
    startWhenIdle(h.host, () => started++)
    h.load()
    expect(h.timers().map(t => t.delayMs)).toEqual([START_FALLBACK_DELAY_MS])
    expect(started).toBe(0)
    h.runTimers()
    expect(started).toBe(1)
  })

  test('cancelled before load: the load listener is removed and nothing starts', () => {
    const h = createHost()
    let started = 0
    const cancel = startWhenIdle(h.host, () => started++)
    cancel()
    expect(h.loadListeners()).toBe(0)
    h.load()
    h.runIdle()
    expect(started).toBe(0)
  })

  test('cancelled while waiting for idle: the idle callback is withdrawn', () => {
    const h = createHost()
    let started = 0
    const cancel = startWhenIdle(h.host, () => started++)
    h.load()
    cancel()
    expect(h.idles()).toEqual([])
    expect(started).toBe(0)
  })

  test('cancelled while waiting on the fallback timer: the timer is cleared', () => {
    const h = createHost({ idle: false })
    let started = 0
    const cancel = startWhenIdle(h.host, () => started++)
    h.load()
    cancel()
    expect(h.timers()).toEqual([])
    expect(started).toBe(0)
  })

  test('starts once, and a cancel after the start is harmless', () => {
    const h = createHost({ loaded: true })
    let started = 0
    const cancel = startWhenIdle(h.host, () => started++)
    h.runIdle()
    h.runIdle()
    cancel()
    expect(started).toBe(1)
  })
})
