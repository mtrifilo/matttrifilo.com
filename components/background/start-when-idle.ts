/**
 * When the honeycomb starts: after the document's load event, at the first
 * moment the main thread is idle.
 *
 * The canvas is decoration drawn on the client, so it adds nothing to the
 * first paint, and on a phone its entrance wave is 60 frames a second of
 * main-thread work. Started at hydration it competed with React for exactly
 * the time that decides when the page responds. Waiting for load (every
 * script the page shipped with has run) and then for idle (hydration's
 * follow-up work has drained) hands the thread to the page first; the
 * honeycomb then draws what it always drew, entrance wave included.
 */

/**
 * The longest the start waits for an idle moment once the page has loaded.
 * It only matters on a page that stays busy past load, such as /ask opened
 * with a question already streaming in, where an idle callback might not
 * come for a long time and the honeycomb would stay blank.
 */
export const START_IDLE_TIMEOUT_MS = 1500

/**
 * Where there is no requestIdleCallback, how long after load to start: a
 * fixed pause standing in for "hydration has probably drained".
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
 * Run `start` once, after load and at the first idle moment. Returns a
 * cancel that is safe to call at any stage, before or after `start` ran.
 */
export function startWhenIdle(host: StartHost, start: () => void): () => void {
  let cancelled = false
  let cancelPending = () => {}

  const run = () => {
    if (cancelled) return
    cancelPending = () => {}
    start()
  }

  const afterLoad = () => {
    if (cancelled) return
    if (host.requestIdle) {
      const handle = host.requestIdle(run, START_IDLE_TIMEOUT_MS)
      cancelPending = () => host.cancelIdle(handle)
    } else {
      const handle = host.setTimer(run, START_FALLBACK_DELAY_MS)
      cancelPending = () => host.clearTimer(handle)
    }
  }

  if (host.isLoaded()) afterLoad()
  else cancelPending = host.onLoad(afterLoad)

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
