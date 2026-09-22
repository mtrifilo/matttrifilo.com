import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'

/**
 * The preload's own contract (MTC-59).
 *
 * It runs before every test file in the suite, so a Happy DOM bump that starts
 * overwriting one more of Bun's globals can take the server suites down with
 * it. The full run would catch that, as thirty-odd streaming tests failing
 * with a message about `ReadableStream` that names nothing to do with the
 * DOM. These fail first and say what happened.
 */

describe('the DOM the preload registers', () => {
  test('is there, with the window surface components read', () => {
    expect(typeof document.createElement).toBe('function')
    // `window` is `globalThis` under the registrator, which is why the
    // preload cannot hand `addEventListener` and friends back to Bun.
    expect(window as unknown).toBe(globalThis)
    expect(typeof window.matchMedia).toBe('function')
    expect(typeof window.getComputedStyle).toBe('function')
    expect(typeof ResizeObserver).toBe('function')
  })

  test('leaves Bun owning the streams', () => {
    // The regression this file exists for. Happy DOM replaces
    // `TransformStream` and `WritableStream` but not `ReadableStream`, and a
    // Bun stream piped through a Happy DOM transform throws `readable should
    // be ReadableStream`, which is what the AI SDK does to every streamed
    // answer.
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('ok')
        controller.close()
      },
    })
    expect(() => stream.pipeThrough(new TransformStream())).not.toThrow()
  })

  test('leaves Bun owning fetch and its message types', () => {
    // The route handlers are called with a `Request` in tests and answer with
    // a `Response`; one suite spies on `globalThis.fetch` directly. All three
    // have to be the implementations the deployed route runs on.
    const request = new Request('https://matttrifilo.com/api/chat', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(new Response('ok').status).toBe(200)
    expect(typeof fetch).toBe('function')
  })

  test('leaves Bun owning URL, which node:fs accepts as a path', () => {
    // Several tests read a file through `new URL(..., import.meta.url)`.
    // node:fs type-checks that argument, so a Happy DOM URL is not a path.
    const self = new URL(import.meta.url)
    expect(readFileSync(self, 'utf8').length).toBeGreaterThan(0)
  })
})

describe('the cleanup the preload registers', () => {
  // Two tests in order: the first renders, the second checks that nothing it
  // left is still in the document. Without the `afterEach` the second would
  // find the first test's markup and any query for it would be ambiguous.
  test('renders something into the document', () => {
    render(<p>left behind</p>)
    expect(document.body.textContent).toContain('left behind')
  })

  test('hands the next test an empty document', () => {
    expect(document.body.textContent).toBe('')
  })
})
