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

const store = new Map<string, string>()
const original = globalThis.sessionStorage

beforeEach(() => {
  store.clear()
  globalThis.sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  } as Storage
})

afterEach(() => {
  // Bun has no sessionStorage of its own, and assigning undefined back would
  // leave an own property behind for every later test file to see.
  if (original === undefined) {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage
  } else {
    globalThis.sessionStorage = original
  }
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
    store.set('matt-career-assistant:pending-question', '{not json')
    expect(hasPendingQuestion()).toBe(false)
  })

  test('is not waiting when storage is blocked', () => {
    globalThis.sessionStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(hasPendingQuestion()).toBe(false)
  })
})
