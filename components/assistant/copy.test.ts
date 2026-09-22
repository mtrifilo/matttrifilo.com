import { describe, expect, test } from 'bun:test'
import { announcementFor } from '@/lib/chat/answer'
import type { ProgressView } from '@/lib/chat/progress'
import {
  MATT_EMAIL,
  PROGRESS_THINKING,
  PROGRESS_WRITING,
  RATE_LIMIT_NOTICE,
  STARTER_QUESTIONS,
  progressChecking,
  progressReading,
  progressSummary,
} from './copy'

/**
 * The copy is Matt's, so these tests pin the shape rather than the voice:
 * a sentence assembled from pieces has to read as a sentence, and the two
 * counts the assistant reports have to agree with English.
 */

/**
 * The starter-question pool (MTC-39).
 *
 * Matt approved twenty-seven questions and the order they ship in, so these
 * hold the shape he approved rather than the wording: a duplicate would give
 * the ticker two identical pills, and an over-long one would widen the row
 * past what a 390px screen can read. The evidence that each question is
 * answerable is the golden suite, not a unit test.
 *
 * Adding a question here means adding its golden in the same change:
 * evals/config.test.ts requires a golden whose `vars.question` is the exact
 * string, and fails naming any entry that has none.
 */
describe('the starter questions', () => {
  /**
   * The ticker renders each question on one line. At the body size the pills
   * use, the longest question Matt approved is 83 characters and about 560px
   * wide, already wider than a 390px screen; this is the ceiling that keeps
   * the next one from being worse.
   */
  const LENGTH_CAP = 90

  // `as const` narrows each entry to its own literal, which makes every
  // comparison below a type error rather than a test.
  const questions: readonly string[] = STARTER_QUESTIONS

  test('ships at least the pool Matt approved', () => {
    expect(questions.length).toBeGreaterThanOrEqual(27)
  })

  test('asks each question once', () => {
    expect(new Set(questions).size).toBe(questions.length)
  })

  test('every question is a question, and fits on a pill', () => {
    for (const question of questions) {
      expect(question.trim()).not.toBe('')
      expect(question).toBe(question.trim())
      expect(question.length).toBeLessThanOrEqual(LENGTH_CAP)
    }
  })

  test('opens on what a hiring manager screens for first', () => {
    // The order is the product decision, so the head of it is pinned.
    expect(questions[0]).toBe('How does Matt use AI coding agents?')
  })

  test('leans on no pronoun, because a pill arrives on its own', () => {
    // A pill drifts past with no question before it to carry a "he", and a
    // visitor who knows nothing of Matt's work meets it cold. This is the
    // rule the pool was rewritten to in September 2026: a pronoun is only
    // ever a second reference, inside a question that has already said who.
    for (const question of questions) {
      const pronoun = /\b(?:he|him|his)\b/i.exec(question)
      if (pronoun === null) continue
      const named = question.indexOf('Matt')
      expect(named).toBeGreaterThanOrEqual(0)
      expect(named).toBeLessThan(pronoun.index)
    }
  })
})

describe('the rate-limit notice', () => {
  test('reads as one sentence once its links are put back in', () => {
    // Rendered in assistant-notice.tsx as lead, résumé link, between, email
    // link, end. Split copy is how a dangling "and" survives an edit.
    const { lead, resumeLabel, between, emailLabel, end } = RATE_LIMIT_NOTICE
    expect(`${lead}${resumeLabel}${between}${emailLabel}${end}`).toBe(
      "You've reached the limit for now. Matt's résumé is one click away, or email him directly."
    )
  })

  test('names no page the site does not serve', () => {
    for (const piece of Object.values(RATE_LIMIT_NOTICE)) {
      expect(piece).not.toContain('knowledge')
      expect(piece).not.toContain('project pages')
    }
  })
})

describe('the progress copy', () => {
  test('counts documents in English', () => {
    expect(progressSummary(1, 0, 9)).toBe('Read 1 document in 9s')
    expect(progressSummary(3, 0, 14)).toBe('Read 3 documents in 14s')
    expect(progressSummary(2, 0, 1)).toBe('Read 2 documents in 1s')
  })

  test('counts a GitHub check apart from the documents', () => {
    // A check is not a read, and the one line that stands in for the whole
    // run must not call it one.
    expect(progressSummary(2, 1, 11)).toBe(
      'Read 2 documents and checked GitHub in 11s'
    )
    expect(progressSummary(1, 1, 8)).toBe(
      'Read 1 document and checked GitHub in 8s'
    )
    expect(progressSummary(0, 1, 6)).toBe('Checked GitHub in 6s')
    // Three repositories checked is still one sentence: the visitor is being
    // told where the answer came from, not how many requests it took.
    expect(progressSummary(0, 3, 9)).toBe('Checked GitHub in 9s')
  })

  test('names the document it is reading, and nothing else', () => {
    expect(progressReading('Résumé')).toBe('Reading Résumé…')
  })

  test('names the repository it is checking, and says it is GitHub', () => {
    expect(progressChecking('psychic-homily-web')).toBe(
      'Checking GitHub for psychic-homily-web…'
    )
  })

  test('the spoken and written forms differ only by the ellipsis', () => {
    // lib/chat/answer.ts speaks these lines to a screen reader from its own
    // literals, because it may not import this module. This is the tripwire
    // for the two drifting apart, and it reads the real announcement rather
    // than a third copy of the words: a test that re-typed them would stay
    // green while the two channels described different work.
    const spoken = (progress: ProgressView) =>
      announcementFor('streaming', false, progress)

    expect(
      spoken({ phase: 'reading', steps: [{ id: 'r', title: 'Résumé' }] })
    ).toBe(progressReading('Résumé').replace('…', ''))
    expect(
      spoken({
        phase: 'reading',
        steps: [{ id: 'decant', title: 'decant', kind: 'activity' }],
      })
    ).toBe(progressChecking('decant').replace('…', ''))
    expect(spoken({ phase: 'writing', steps: [] })).toBe(
      PROGRESS_WRITING.replace('…', '')
    )
  })

  test('the wait before a first read is Thinking', () => {
    expect(PROGRESS_THINKING).toBe('Thinking…')
  })
})

describe('the assistant never speaks as Matt', () => {
  test('the email is his, and the voice is about him', () => {
    expect(MATT_EMAIL).toBe('matt.trifilo@gmail.com')
    expect(RATE_LIMIT_NOTICE.lead).toContain("Matt's")
  })
})
