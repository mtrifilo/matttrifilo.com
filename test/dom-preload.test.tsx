import { describe, expect, spyOn, test } from 'bun:test'
import { join } from 'node:path'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { BUN_GLOBALS, takeCaughtDomErrors } from './dom-preload'

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

describe('an error a DOM listener throws', () => {
  // The Happy DOM behaviour the preload's error hook is built on. A listener's
  // error never leaves `dispatchEvent`: Happy DOM catches it and dispatches it
  // on `window` as an `ErrorEvent`. So no wrapper around `dispatchEvent` could
  // see it, and a test that fired the event would pass. If a Happy DOM bump
  // changes either half, this fails and names the premise that moved.
  test('arrives on the window as an ErrorEvent, not at the caller', () => {
    const thrown = new Error('a listener failed')
    const target = document.createElement('button')
    target.addEventListener('click', () => {
      throw thrown
    })
    const heard: unknown[] = []
    const onError = (event: Event) => heard.push((event as ErrorEvent).error)
    // Happy DOM prints what it catches; this error is expected.
    const printed = spyOn(console, 'error').mockImplementation(() => {})
    window.addEventListener('error', onError)
    try {
      expect(() => target.dispatchEvent(new Event('click'))).not.toThrow()
    } finally {
      window.removeEventListener('error', onError)
      printed.mockRestore()
    }
    expect(heard).toHaveLength(1)
    expect(heard[0]).toBe(thrown)

    // Taken here, so the preload does not fail this test for it.
    const taken = takeCaughtDomErrors()
    expect(taken).toHaveLength(1)
    expect(taken[0]).toBe(thrown)
  })

  // The acceptance itself, run in a child `bun test` because the tests it
  // proves are meant to fail. The fixture holds four that should go red
  // (a listener added with `addEventListener` that throws and one that
  // rejects, which only the preload's hook catches, and a React `onClick`
  // that throws and one that rejects, which Bun catches) and two that should
  // stay green after them.
  test('fails the test that fired it, with the stack of the listener', () => {
    const run = Bun.spawnSync(
      [
        process.execPath,
        'test',
        './test/fixtures/throwing-listener.fixture.tsx',
      ],
      {
        cwd: join(import.meta.dir, '..'),
        env: { ...process.env, NO_COLOR: '1' },
      }
    )
    const output = `${run.stdout.toString()}${run.stderr.toString()}`

    const failed = [...output.matchAll(/^\(fail\) (.+?) \[/gm)].map(
      match => match[1]
    )
    expect(failed).toEqual([
      'red: a listener added with addEventListener throws',
      'red: a listener added with addEventListener rejects',
      'red: a React onClick throws',
      'red: a React onClick rejects',
    ])
    expect(output).toMatch(/^ 2 pass$/m)
    expect(run.exitCode).toBe(1)
    // The report carries the stack from the listener, not from the hook
    // that rethrew it.
    for (const message of ['the listener threw', 'the listener rejected']) {
      expect(output).toMatch(
        new RegExp(
          `Error: ${message}\\n(?: +at .*\\n)*? +at .*throwing-listener\\.fixture\\.tsx:\\d+:\\d+`
        )
      )
    }
  }, 30_000)
})
