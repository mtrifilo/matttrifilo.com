import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { STARTER_QUESTIONS } from './copy'
import { HomeAssistantPanel } from './home-assistant-panel'
import { takePendingQuestion } from './pending-question'

/**
 * The homepage's half of the hand-off to /ask: what it tells /ask about how
 * the question was asked. The tap happens here and the answer streams there,
 * so /ask can only keep a phone's keyboard down on arrival if it is told the
 * pick was a touch. /ask's half is in assistant-chat.test.tsx.
 *
 * Happy DOM answers `(pointer: coarse)` from `navigator.maxTouchPoints` in its
 * browser settings, so a touch device is stated there.
 */

const settings = (
  window as unknown as {
    happyDOM: { settings: { navigator: { maxTouchPoints: number } } }
  }
).happyDOM.settings

function setTouchDevice(touch: boolean): void {
  settings.navigator.maxTouchPoints = touch ? 5 : 0
}

let pushed: string[] = []

/** The app router, reduced to what the panel calls. */
const router = {
  push: (href: string) => {
    pushed.push(href)
  },
  prefetch: () => {},
} as unknown as AppRouterInstance

beforeEach(() => {
  pushed = []
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
  setTouchDevice(false)
})

function renderPanel(): void {
  render(
    <AppRouterContext.Provider value={router}>
      <HomeAssistantPanel />
    </AppRouterContext.Provider>
  )
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
      pickedByTouch: true,
    })
  })

  test('says it was picked by touch after a tap on a fine-pointer touchscreen', () => {
    renderPanel()
    fireEvent.pointerDown(starterPill(), { pointerType: 'touch' })
    fireEvent.click(starterPill())
    expect(takePendingQuestion()?.pickedByTouch).toBe(true)
  })

  test('says it was not picked by touch after a mouse pick', () => {
    renderPanel()
    fireEvent.pointerDown(starterPill(), { pointerType: 'mouse' })
    fireEvent.click(starterPill())
    expect(takePendingQuestion()).toEqual({
      question: STARTER_QUESTIONS[0],
      pickedByTouch: false,
    })
  })

  test('says it was not picked by touch when it was typed, even on a phone', () => {
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
      pickedByTouch: false,
    })
  })
})
