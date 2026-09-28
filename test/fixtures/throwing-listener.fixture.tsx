import { expect, test } from 'bun:test'
import { useEffect, useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { takeCaughtDomErrors } from '../dom-preload'

/**
 * Tests that are meant to fail, run only by test/dom-preload.test.tsx in a
 * child `bun test`. The name carries no `.test.`, so the suite itself never
 * collects this file. The parent asserts which of these fail, with what, and
 * that the ones after them pass.
 */

/** A button that listens the way a component does outside React's props. */
function ListeningButton({ onPress }: { onPress: () => unknown }) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = button.current
    if (!element) return
    element.addEventListener('click', onPress)
    return () => element.removeEventListener('click', onPress)
  }, [onPress])
  return <button ref={button}>press</button>
}

function press() {
  fireEvent.click(screen.getByText('press'))
}

test('red: a listener added with addEventListener throws', () => {
  render(
    <ListeningButton
      onPress={() => {
        throw new Error('the listener threw')
      }}
    />
  )
  press()
})

test('red: a listener added with addEventListener rejects', () => {
  render(
    <ListeningButton
      onPress={async () => {
        throw new Error('the listener rejected')
      }}
    />
  )
  press()
})

/** A component that listens on `window`, as a scroll-aware header does. */
function ScrollWatcher({ onScroll }: { onScroll: () => unknown }) {
  useEffect(() => {
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [onScroll])
  return null
}

test('red: a listener on window throws', () => {
  render(
    <ScrollWatcher
      onScroll={() => {
        throw new Error('the window listener threw')
      }}
    />
  )
  fireEvent.scroll(window)
})

test('red: a React onClick throws', () => {
  render(
    <button
      onClick={() => {
        throw new Error('the onClick threw')
      }}
    >
      press
    </button>
  )
  press()
})

test('red: a React onClick rejects', () => {
  render(
    <button
      onClick={async () => {
        throw new Error('the onClick rejected')
      }}
    >
      press
    </button>
  )
  press()
})

test('green: the test after them starts with nothing caught', () => {
  expect(takeCaughtDomErrors()).toEqual([])
})

test('green: a test that expects a listener to throw takes the error', () => {
  const expected = new Error('the listener was meant to throw')
  render(
    <ListeningButton
      onPress={() => {
        throw expected
      }}
    />
  )
  press()
  expect(takeCaughtDomErrors()).toEqual([expected])
})
