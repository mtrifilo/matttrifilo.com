/**
 * When the honeycomb starts: after the document's load event, at the first
 * moment the main thread is idle.
 *
 * The canvas is decoration drawn on the client, so it adds nothing to the
 * first paint, and on a phone its entrance wave is 60 frames a second of
 * main-thread work. Run alongside hydration, those frames compete with React
 * for the time that decides when the page responds. Waiting for load (every
 * script the page shipped with has run) and then for idle (hydration's
 * follow-up work has drained) hands the thread to the page first; the
 * honeycomb then draws what it would have drawn at mount, entrance wave
 * included.
 */

/**
 * The longest the start waits for the load event, counted from mount. Load
 * waits for every subresource in flight, and one that stalls on a lossy
 * connection (a script injected during hydration, say) would otherwise keep
 * the background blank for as long as the request hangs. Past this the
 * start stops waiting for load and moves on to waiting for idle.
 */
export const START_LOAD_WAIT_CAP_MS = 3000

/**
 * The longest the start then waits for an idle moment. It matters only when
 * the main thread stays busy after load, as it can on a slow phone still
 * working through long tasks; without a cap the honeycomb would wait for
 * that work to end.
 */
export const START_IDLE_TIMEOUT_MS = 1500

/**
 * Where there is no requestIdleCallback (Safari and iOS ship without it), how
 * long after load to start: a fixed pause standing in for "hydration's
 * follow-up work has probably drained".
 */
export const START_FALLBACK_DELAY_MS = 300

/** What the start needs from the browser, so tests can drive it by hand. */
export interface StartHost {
  /** True once the load event has fired. */
  isLoaded: () => boolean
  /** Call the listener once, on load; returns a function that unsubscribes. */
  onLoad: (listener: () => void) => () => void
  /** null where the browser has no requestIdleCallback. */
  requestIdle: ((callback: () => void, timeoutMs: number) => number) | null
  cancelIdle: (handle: number) => void
  setTimer: (callback: () => void, delayMs: number) => number
  clearTimer: (handle: number) => void
}

/**
 * Run `start` once, after load (or START_LOAD_WAIT_CAP_MS, whichever comes
 * first) and at the first idle moment. Returns a cancel that is safe to call
 * at any stage, before or after `start` ran.
 */
export function startWhenIdle(host: StartHost, start: () => void): () => void {
  let cancelled = false
  let cancelPending = () => {}

  const run = () => {
    if (cancelled) return
    cancelPending = () => {}
    start()
  }

  const waitForIdle = () => {
    if (cancelled) return
    if (host.requestIdle) {
      const handle = host.requestIdle(run, START_IDLE_TIMEOUT_MS)
      cancelPending = () => host.cancelIdle(handle)
    } else {
      const handle = host.setTimer(run, START_FALLBACK_DELAY_MS)
      cancelPending = () => host.clearTimer(handle)
    }
  }

  if (host.isLoaded()) {
    waitForIdle()
  } else {
    // Load and the cap race; the first to arrive withdraws the other.
    let unsubscribe = () => {}
    let capTimer = 0
    let settled = false
    const loadedOrGaveUp = () => {
      if (settled) return
      settled = true
      unsubscribe()
      host.clearTimer(capTimer)
      waitForIdle()
    }
    unsubscribe = host.onLoad(loadedOrGaveUp)
    capTimer = host.setTimer(loadedOrGaveUp, START_LOAD_WAIT_CAP_MS)
    cancelPending = () => {
      unsubscribe()
      host.clearTimer(capTimer)
    }
  }

  return () => {
    cancelled = true
    cancelPending()
  }
}

/** The real browser behind StartHost. */
export function browserStartHost(): StartHost {
  return {
    isLoaded: () => document.readyState === 'complete',
    onLoad: listener => {
      window.addEventListener('load', listener, { once: true })
      return () => window.removeEventListener('load', listener)
    },
    requestIdle:
      typeof window.requestIdleCallback === 'function'
        ? (callback, timeoutMs) =>
            window.requestIdleCallback(callback, { timeout: timeoutMs })
        : null,
    cancelIdle: handle => window.cancelIdleCallback(handle),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: handle => window.clearTimeout(handle),
  }
}
