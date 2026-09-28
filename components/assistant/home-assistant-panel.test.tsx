import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import { setTouchDevice } from '@/test/touch-device'
import { STARTER_QUESTIONS } from './copy'
import {
  RoutedHomeAssistantPanel,
  type PanelRouter,
} from './home-assistant-panel'
import { takePendingQuestion } from './pending-question'

/**
 * The homepage's half of the hand-off to /ask: what it tells /ask about how
 * the question was asked. The pick happens here and the answer streams
 * there, so /ask can only keep a phone's keyboard down after a tap, and put
 * the caret in the composer after any other pick, if it is told which it
 * was. /ask's half is in assistant-chat.test.tsx.
 *
 * A touch device is stated through Happy DOM's settings (test/touch-device.ts).
 */

let pushed: string[] = []

/** The app router, reduced to what the panel calls. */
const router: PanelRouter = {
  push: (href: string) => {
    pushed.push(href)
  },
  prefetch: () => {},
}

beforeEach(() => {
  pushed = []
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
  setTouchDevice(false)
})

function renderPanel(): void {
  render(<RoutedHomeAssistantPanel router={router} />)
}

/** The announced copy of a starter pill; the decorative copies are hidden. */
function starterPill(): HTMLElement {
  return screen.getByRole('button', { name: STARTER_QUESTIONS[0] })
}

describe('a question handed over from the homepage', () => {
  test('says it was picked by touch after a tap', () => {
    setTouchDevice(true)
    renderPanel()
    fireEvent.pointerDown(starterPill(), { pointerType: 'touch' })
    fireEvent.click(starterPill())
    expect(pushed).toEqual(['/ask'])
    expect(takePendingQuestion()).toEqual({
      question: STARTER_QUESTIONS[0],
      askedBy: 'touch-pick',
    })
  })

  test('says it was picked by touch after a tap on a fine-pointer touchscreen', () => {
    renderPanel()
    fireEvent.pointerDown(starterPill(), { pointerType: 'touch' })
    fireEvent.click(starterPill())
    expect(takePendingQuestion()?.askedBy).toBe('touch-pick')
  })

  test('says it was picked by touch after a click with no press on a touch device', () => {
    // A screen reader's activation can be a bare click; the device decides.
    setTouchDevice(true)
    renderPanel()
    fireEvent.click(starterPill())
    expect(takePendingQuestion()?.askedBy).toBe('touch-pick')
  })

  test('says it was picked otherwise after a mouse pick', () => {
    renderPanel()
    fireEvent.pointerDown(starterPill(), { pointerType: 'mouse' })
    fireEvent.click(starterPill())
    expect(takePendingQuestion()).toEqual({
      question: STARTER_QUESTIONS[0],
      askedBy: 'other-pick',
    })
  })

  test('says it was picked otherwise after a mouse, a pen or a key on a touch device', () => {
    // The press wins over the device (Matt, 2026-09-23, MTC-81).
    setTouchDevice(true)
    renderPanel()
    fireEvent.pointerDown(starterPill(), { pointerType: 'mouse' })
    fireEvent.click(starterPill())
    expect(takePendingQuestion()?.askedBy).toBe('other-pick')
    fireEvent.pointerDown(starterPill(), { pointerType: 'pen' })
    fireEvent.click(starterPill())
    expect(takePendingQuestion()?.askedBy).toBe('other-pick')
    fireEvent.keyDown(starterPill(), { key: 'Enter' })
    fireEvent.click(starterPill())
    expect(takePendingQuestion()?.askedBy).toBe('other-pick')
  })

  test('says it was picked otherwise after a keyboard pick that follows a tap', () => {
    renderPanel()
    fireEvent.pointerDown(starterPill(), { pointerType: 'touch' })
    fireEvent.keyDown(starterPill(), { key: 'Enter' })
    fireEvent.click(starterPill())
    expect(takePendingQuestion()?.askedBy).toBe('other-pick')
  })

  test('says it was typed when it was typed, even on a phone', () => {
    // A typed question is not a pick: /ask treats it as it treats any load.
    setTouchDevice(true)
    renderPanel()
    const composer = screen.getByRole('textbox', {
      name: "Ask a question about Matt's work",
    })
    fireEvent.change(composer, { target: { value: 'What did Matt ship?' } })
    fireEvent.keyDown(composer, { key: 'Enter' })
    expect(pushed).toEqual(['/ask'])
    expect(takePendingQuestion()).toEqual({
      question: 'What did Matt ship?',
      askedBy: 'typing',
    })
  })
})
