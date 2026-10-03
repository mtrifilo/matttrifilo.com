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
    // By identity, not behavior: Happy DOM's `Request`, `Response`, `URL`
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
  // The Happy DOM behavior the preload's error hook is built on. A listener's
  // error never leaves `dispatchEvent`: Happy DOM catches it and dispatches it
  // on `window` as an `ErrorEvent`. So no wrapper around `dispatchEvent` could
  // see it, and a test that fired the event would pass. If a Happy DOM bump
  // changes either half, these fail and name the premise that moved.
  function dispatchQuietly(target: EventTarget, event: Event) {
    const heard: unknown[] = []
    const onError = (error: Event) => heard.push((error as ErrorEvent).error)
    // Happy DOM prints what it catches; these errors are expected.
    const printed = spyOn(console, 'error').mockImplementation(() => {})
    window.addEventListener('error', onError)
    try {
      expect(() => target.dispatchEvent(event)).not.toThrow()
    } finally {
      window.removeEventListener('error', onError)
      printed.mockRestore()
    }
    return heard
  }

  test('on an element arrives on the window, not at the caller', () => {
    const thrown = new Error('an element listener failed')
    const target = document.createElement('button')
    target.addEventListener('click', () => {
      throw thrown
    })

    const heard = dispatchQuietly(target, new Event('click'))

    expect(heard).toHaveLength(1)
    expect(heard[0]).toBe(thrown)
    // Taken here, so the preload does not fail this test for it.
    const taken = takeCaughtDomErrors()
    expect(taken).toHaveLength(1)
    expect(taken[0]).toBe(thrown)
  })

  test('on the window itself arrives the same way', () => {
    // Without the method the preload gives `globalThis`, Happy DOM throws a
    // TypeError of its own here and this error is lost.
    const thrown = new Error('a window listener failed')
    const listener = () => {
      throw thrown
    }
    window.addEventListener('scroll', listener)
    let heard: unknown[]
    try {
      heard = dispatchQuietly(window, new Event('scroll'))
    } finally {
      window.removeEventListener('scroll', listener)
    }

    expect(heard).toHaveLength(1)
    expect(heard[0]).toBe(thrown)
    const taken = takeCaughtDomErrors()
    expect(taken).toHaveLength(1)
    expect(taken[0]).toBe(thrown)
  })

  test('on a MediaQueryList leaves dispatchEvent, since Happy DOM does not catch it', () => {
    // A MediaQueryList belongs to no window, so its listener's error fails
    // whatever dispatched the event directly, and the preload records nothing.
    const thrown = new Error('a media query listener failed')
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    query.addEventListener('change', () => {
      throw thrown
    })

    expect(() => query.dispatchEvent(new Event('change'))).toThrow(thrown)
    expect(takeCaughtDomErrors()).toEqual([])
  })

  test('dispatched by a test without an error is not recorded', () => {
    // Only Happy DOM's report carries the error it caught; a test exercising
    // a component's own `error` listener is not a listener failure.
    window.dispatchEvent(new ErrorEvent('error', { message: 'simulated' }))
    expect(takeCaughtDomErrors()).toEqual([])
  })

  // The acceptance itself, run in a child `bun test` because the tests it
  // proves are meant to fail. The fixture holds five that should go red
  // (listeners added with `addEventListener` that throw, reject, or sit on
  // `window`, which only the preload's hook catches, and a React `onClick`
  // that throws and one that rejects, which Bun catches) and two that should
  // stay green after them.
  test('fails the test that fired it, with the stack of the listener', () => {
    // Bun lets FORCE_COLOR win over NO_COLOR, and a colored report marks a
    // failure with a glyph rather than `(fail)`. Under GITHUB_ACTIONS the
    // child adds workflow commands to its report, which the runner would read
    // as the parent's own annotations if the report below were printed.
    const env: Record<string, string | undefined> = {
      ...process.env,
      NO_COLOR: '1',
    }
    delete env.FORCE_COLOR
    delete env.GITHUB_ACTIONS
    const run = Bun.spawnSync(
      [
        process.execPath,
        'test',
        './test/fixtures/throwing-listener.fixture.tsx',
      ],
      {
        cwd: join(import.meta.dir, '..'),
        env,
      }
    )
    const output = `${run.stdout.toString()}${run.stderr.toString()}`.replace(
      /\x1b\[[0-9;]*m/g,
      ''
    )

    // Bun ends a result line with the test's duration only when it measured
    // more than 10 microseconds, and on a Linux runner (sometimes on a loaded
    // Mac too) it often measures a test that takes under a millisecond as
    // zero. So the duration is optional here, and the name runs to the end
    // of its line.
    const failed = [
      ...output.matchAll(/^\(fail\) (.+?)(?: \[\d+\.\d{2}ms\])?$/gm),
    ].map(match => match[1])
    const tally = {
      pass: output.match(/^ (\d+) pass$/m)?.[1],
      fail: output.match(/^ (\d+) fail$/m)?.[1],
    }
    const expectedTally = { pass: '2', fail: '5' }
    const expectedFailures = [
      'red: a listener added with addEventListener throws',
      'red: a listener added with addEventListener rejects',
      'red: a listener on window throws',
      'red: a React onClick throws',
      'red: a React onClick rejects',
    ]
    if (
      !Bun.deepEquals(tally, expectedTally) ||
      !Bun.deepEquals(failed, expectedFailures)
    ) {
      // The child's whole report, because the assertions below say only
      // what is missing, not what Bun printed in its place. Indented, so no
      // line of it starts where a CI runner looks for a workflow command.
      console.error(`The child run's report:\n${output.replace(/^/gm, '  ')}`)
    }
    // Bun's own count first. A wrong count means a test did not end as the
    // fixture means it to (a red one passed, say, because its error was
    // reported late or charged to the next test); a right count with a name
    // missing means a result line was printed in a form the pattern above
    // does not read.
    expect(tally).toEqual(expectedTally)
    expect(failed).toEqual(expectedFailures)
    expect(run.exitCode).toBe(1)
    // Each failure carries the stack from the handler. The hook's report
    // quotes `error.stack`, which reads `Error: ...`; Bun's own report of a
    // React handler's error reads `error: ...`.
    const reports = [
      'Error: the listener threw',
      'Error: the listener rejected',
      'Error: the window listener threw',
      'error: the onClick threw',
      'error: the onClick rejected',
    ]
    for (const report of reports) {
      expect(output).toMatch(
        new RegExp(
          `${report}\\n(?: +at .*\\n)*? +at .*throwing-listener\\.fixture\\.tsx:\\d+:\\d+`
        )
      )
    }
  }, 30_000)
})
