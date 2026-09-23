import { describe, expect, test } from 'bun:test'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { BUN_GLOBALS } from './dom-preload'

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

  test('leaves every Bun global it replaced as Bun had it', () => {
    // By identity, not behaviour: Happy DOM's `Request`, `Response`, `URL`
    // and `fetch` behave like Bun's in a smoke test, and differ where the
    // route handlers and the AI SDK depend on them.
    expect(BUN_GLOBALS.has('document')).toBe(false)
    for (const name of ['fetch', 'Request', 'Response', 'Headers', 'URL']) {
      expect(BUN_GLOBALS.has(name)).toBe(true)
    }
    const handedToHappyDom = [...BUN_GLOBALS].flatMap(([name, bun]) => {
      const current = Object.getOwnPropertyDescriptor(globalThis, name)
      const same =
        current !== undefined &&
        ('value' in bun
          ? current.value === bun.value
          : current.get === bun.get && current.set === bun.set)
      return same ? [] : [name]
    })
    expect(handedToHappyDom).toEqual([])
  })
})

describe('the globals the browser keeps', () => {
  // Happy DOM's dispatchEvent rejects an event that is not its own `Event`,
  // so each of these fails if its class is handed back to Bun.
  test('an event fired at a controlled input reaches React', () => {
    function Field({ onValue }: { onValue: (value: string) => void }) {
      const [value, setValue] = useState('')
      return (
        <input
          aria-label="field"
          onChange={event => {
            setValue(event.target.value)
            onValue(event.target.value)
          }}
          value={value}
        />
      )
    }
    const seen: string[] = []
    render(<Field onValue={value => seen.push(value)} />)

    fireEvent.change(screen.getByLabelText('field'), {
      target: { value: 'typed' },
    })
    expect(seen).toEqual(['typed'])
  })

  test('a CustomEvent reaches an element listener', () => {
    const target = document.createElement('div')
    const details: unknown[] = []
    target.addEventListener('ping', event => {
      details.push((event as CustomEvent).detail)
    })
    target.dispatchEvent(new CustomEvent('ping', { detail: 1 }))
    expect(details).toEqual([1])
  })

  test('an Event reaches a window listener', () => {
    let heard = 0
    const listener = () => {
      heard += 1
    }
    window.addEventListener('resize', listener)
    window.dispatchEvent(new Event('resize'))
    window.removeEventListener('resize', listener)
    expect(heard).toBe(1)
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
