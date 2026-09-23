import { afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

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

// Imported after registration: React Testing Library reads `document` while
// its own module evaluates.
const { cleanup } = await import('@testing-library/react')

afterEach(cleanup)
