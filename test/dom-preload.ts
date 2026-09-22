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
 * what keeps that from costing the rest of the suite.
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
 * were handed back to Bun. The second group are the event classes Happy
 * DOM's own `dispatchEvent` type-checks its argument against, which is how
 * React Testing Library's events reach a component.
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

const bunGlobals = new Map<string, PropertyDescriptor>()
for (const name of Object.getOwnPropertyNames(globalThis)) {
  if (BROWSER_OWNS.has(name)) continue
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  // A property that cannot be redefined cannot have been replaced either,
  // so there is nothing to put back.
  if (descriptor?.configurable) bunGlobals.set(name, descriptor)
}

GlobalRegistrator.register({
  // A real origin. Component code reads `location`, and `:focus-visible`
  // resolves against a document that has to believe it is on a page.
  url: 'https://matttrifilo.com/',
})

for (const [name, descriptor] of bunGlobals) {
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
