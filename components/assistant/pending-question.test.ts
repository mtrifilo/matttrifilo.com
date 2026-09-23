import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  handOffQuestion,
  hasPendingQuestion,
  takePendingQuestion,
} from './pending-question'

/**
 * The homepage's hand-off to /ask. /ask reads whether a question is waiting
 * while it renders, to lay out a conversation from its first frame, and then
 * takes it once. Reading must never consume it, or the question would be
 * lost between the render and the send.
 */

// The test DOM's own sessionStorage, shared by every test file in the run,
// so each test starts from an empty one and leaves nothing behind.
beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('the pending question', () => {
  test('is seen without being taken, then taken once', () => {
    handOffQuestion('What did Matt ship?', 1_000)
    expect(hasPendingQuestion(1_500)).toBe(true)
    expect(hasPendingQuestion(1_500)).toBe(true)
    expect(takePendingQuestion(1_500)).toBe('What did Matt ship?')
    expect(hasPendingQuestion(1_500)).toBe(false)
    expect(takePendingQuestion(1_500)).toBeNull()
  })

  test('is not waiting once it has gone stale, which is when take refuses it', () => {
    handOffQuestion('What did Matt ship?', 0)
    expect(hasPendingQuestion(120_000)).toBe(false)
    expect(takePendingQuestion(120_000)).toBeNull()
  })

  test('is not waiting when what is stored is not a question', () => {
    sessionStorage.setItem(
      'matt-career-assistant:pending-question',
      '{not json'
    )
    expect(hasPendingQuestion()).toBe(false)
  })

  test('is not waiting when storage is blocked', () => {
    // A blocked browser throws on reaching sessionStorage at all. A spy on
    // the test DOM's storage would not take: its methods are not writable.
    const real = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
    if (!real) throw new Error('the test DOM has no sessionStorage')
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    try {
      expect(hasPendingQuestion()).toBe(false)
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', real)
    }
  })
})
