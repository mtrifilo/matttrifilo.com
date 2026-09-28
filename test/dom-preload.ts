import { afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { PropertySymbol } from 'happy-dom'

/**
 * The DOM that `bun test` renders components into (MTC-59).
 *
 * `bunfig.toml` preloads this once per run, before any test file is
 * imported, which is the only moment `window` and `document` can reach
 * `globalThis` early enough for React DOM: React reads them while its own
 * module evaluates, and a test file's imports are all evaluated before its
 * first line runs.
 *
 * Bun offers no way to scope a test preload to a subset of files, so every
 * test in the suite runs with these globals present. The two rules below are
 * what keeps that from costing the rest of the suite. What they do not undo
 * is the globals Happy DOM adds: `window`, `document` and `location` stay, so
 * a library that sniffs for a browser takes its browser branch under test
 * (the AI SDK's user agent and google-auth-library's crypto both do). No
 * suite depends on either today; one that does has to say so.
 *
 * **Bun's own globals stay Bun's.** Happy DOM overwrites about thirty
 * globals Bun already implements, and some of those are what the route
 * handlers, the AI SDK and the file-reading tests run on. The clearest
 * failure is streams: Happy DOM replaces `TransformStream` and
 * `WritableStream` but not `ReadableStream`, so a Bun stream piped through a
 * Happy DOM transform throws `readable should be ReadableStream` and every
 * streaming test fails. Rather than name the primitives that matter, this
 * restores every Bun global Happy DOM replaced, except the short list below
 * that has to stay the browser's.
 *
 * **Every test starts with an empty document.** React Testing Library's
 * `cleanup` unmounts what a test rendered and empties the container. Without
 * it a later query would match an earlier test's markup, and both tests
 * would pass or fail depending on file order.
 *
 * **An error a DOM callback throws fails the test.** Happy DOM catches what
 * a listener throws, as a browser does, so without the hook at the bottom of
 * this file a component could crash in a handler while every test stayed
 * green.
 */

/**
 * The globals the browser has to win, because the DOM is defined in terms of
 * them.
 *
 * The registrator makes `globalThis` the window itself, so the first group
 * are the window's own methods and would stop working on `window` if they
 * were handed back to Bun. The second group are the event classes, plus the
 * `MessagePort` a `MessageEvent` carries: Happy DOM's `dispatchEvent` rejects
 * anything that is not an instance of its own `Event`, so an event built
 * from a Bun class never reaches a listener. That is the path React Testing
 * Library's `fireEvent` takes to a component.
 *
 * The restore hands every other name back to Bun, so a Happy DOM API that
 * expects its own type gets Bun's instead. Two known cases: `new
 * FormData(form)` returns an empty Bun `FormData`, and Happy DOM's
 * `FileReader` rejects a Bun `Blob`. A component test that needs one of
 * these adds the name here, checks the full suite still passes with that
 * global now Happy DOM's, and pins the case in test/dom-preload.test.tsx.
 */
const BROWSER_OWNS: ReadonlySet<string> = new Set([
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'postMessage',
  'navigator',
  'CloseEvent',
  'CustomEvent',
  'ErrorEvent',
  'Event',
  'EventTarget',
  'MessageEvent',
  'MessagePort',
])

/**
 * Bun's own globals as they were before Happy DOM registered, which the
 * preload's test compares against by identity.
 */
export const BUN_GLOBALS: ReadonlyMap<string, PropertyDescriptor> =
  snapshotBunGlobals()

function snapshotBunGlobals(): Map<string, PropertyDescriptor> {
  const bunGlobals = new Map<string, PropertyDescriptor>()
  for (const name of Object.getOwnPropertyNames(globalThis)) {
    if (BROWSER_OWNS.has(name)) continue
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    // A property that cannot be redefined cannot have been replaced either,
    // so there is nothing to put back.
    if (descriptor?.configurable) bunGlobals.set(name, descriptor)
  }
  return bunGlobals
}

GlobalRegistrator.register({
  // An http origin rather than Happy DOM's default `about:blank`, so a
  // relative URL resolved against `document.baseURI` has a base, as it does
  // on the site.
  url: 'https://matttrifilo.com/',
})

for (const [name, descriptor] of BUN_GLOBALS) {
  const current = Object.getOwnPropertyDescriptor(globalThis, name)
  if (current && !isReplaced(current, descriptor)) continue
  Object.defineProperty(globalThis, name, descriptor)
}

/**
 * Whether Happy DOM handed back something other than what Bun had.
 *
 * Accessors are compared by their functions rather than by reading them: a
 * getter that allocates (or throws on a global nothing has initialised)
 * must not be invoked just to decide whether to restore it.
 */
function isReplaced(current: PropertyDescriptor, bun: PropertyDescriptor) {
  if ('value' in bun || 'value' in current) return current.value !== bun.value
  return current.get !== bun.get || current.set !== bun.set
}

/**
 * The errors Happy DOM caught from DOM callbacks since the last test ended,
 * in the order they were thrown.
 *
 * Happy DOM runs each listener on a target that belongs to the window (an
 * element, the document, `window` itself) inside its own try/catch: it
 * prints the error, dispatches it on `window` as an `ErrorEvent`, and
 * carries on, so `dispatchEvent` returns normally to whoever fired the event.
 * That is why this listens on `window` rather than wrapping `dispatchEvent`:
 * the catch is inside Happy DOM's dispatch, around every listener at every
 * node on the event's path, so a wrapper never sees anything thrown. The
 * `error` event is the one place every caught error passes through,
 * including a listener's rejected promise and a `requestAnimationFrame`
 * callback that throws. A `MediaQueryList` belongs to no window, so Happy
 * DOM does not catch its listeners at all: their errors leave
 * `dispatchEvent` and fail whatever dispatched the event, with their own
 * stack.
 *
 * React's own handlers (`onClick` and the rest) take another route. React
 * catches what they throw and hands it to the global `reportError`, which
 * the restore above leaves Bun's, and Bun fails the running test on it; an
 * `async` handler's rejection is an unhandled rejection, which Bun fails the
 * running test on too. What this hook adds is everything a component
 * registers with `addEventListener`.
 *
 * An error is charged to whichever test is running when Happy DOM catches
 * it, so a frame callback, or an async listener that throws after an
 * `await`, that fails after its test ended fails a later test (its stack
 * still names the callback) or, after the run's last test, none.
 */
const caughtDomErrors: unknown[] = []

window.addEventListener(
  'error',
  event => {
    // Happy DOM's report always carries the error it caught. An `error`
    // event without one (Happy DOM defaults it to null) was dispatched by a
    // test, not caught from a listener.
    if (!('error' in event) || event.error == null) return
    caughtDomErrors.push(event.error)
  },
  // Capture on `window` runs before any listener a component or test adds
  // there, so one that stops propagation cannot hide the error.
  { capture: true }
)

/**
 * Where Happy DOM reports what it caught from a listener on `window` itself.
 *
 * The registrator makes `globalThis` the window such a listener belongs to,
 * but copies only the window's own properties onto it, not this method,
 * which Happy DOM keeps on the window's prototype. Without it, an error
 * thrown by a listener on `window` (`scroll`, `resize`, `pointermove`) makes
 * Happy DOM throw `window[PropertySymbol.dispatchError] is not a function`
 * out of `dispatchEvent`, and the listener's own error is lost. This does
 * what Happy DOM's own does: print the error and dispatch it on `window`.
 */
if (!(PropertySymbol.dispatchError in globalThis)) {
  Object.defineProperty(globalThis, PropertySymbol.dispatchError, {
    configurable: true,
    value(error: unknown) {
      console.error(error)
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: error instanceof Error ? error.message : String(error),
          error,
        })
      )
    },
  })
}

/**
 * Hands over the errors caught since the last test ended and forgets them,
 * so they are not rethrown when the test ends. For a test whose premise is
 * that a listener throws: it asserts on what it takes, and spies on
 * `console.error` if it wants a quiet run, since Happy DOM prints what it
 * catches. It covers only what Happy DOM caught; an error from a React prop
 * handler goes to Bun, which fails the test regardless.
 */
export function takeCaughtDomErrors(): unknown[] {
  return caughtDomErrors.splice(0)
}

// Imported after registration: React Testing Library reads `document` while
// its own module evaluates.
const { cleanup } = await import('@testing-library/react')

afterEach(() => {
  // Unmounting can fire listeners of its own, so the errors are read after
  // it; and a cleanup that throws still has to leave nothing recorded for the
  // next test.
  let cleanupFailure: { error: unknown } | undefined
  try {
    cleanup()
  } catch (error) {
    cleanupFailure = { error }
  }
  const caught = takeCaughtDomErrors()
  if (caught.length === 0 && cleanupFailure === undefined) return

  // A new error rather than the caught one rethrown: Bun's reporter prints
  // where an error was last thrown, which would be this line, not the
  // listener. The original stacks travel in the message, and the originals
  // in `cause`.
  const reports = caught.map(
    (error, index) =>
      `${index + 1}. A DOM callback threw and Happy DOM caught it:\n${stackOf(error)}`
  )
  if (cleanupFailure) {
    reports.push(
      `${reports.length + 1}. React Testing Library's cleanup threw:\n${stackOf(cleanupFailure.error)}`
    )
  }
  throw new Error(
    `After this test ended, test/dom-preload.ts found ${reports.length === 1 ? 'an error' : `${reports.length} errors`}:\n\n${reports.join('\n\n')}`,
    {
      cause: cleanupFailure ? [...caught, cleanupFailure.error] : caught,
    }
  )
})

function stackOf(error: unknown): string {
  if (error instanceof Error) return error.stack ?? String(error)
  return String(error)
}
