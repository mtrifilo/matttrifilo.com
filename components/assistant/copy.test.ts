import { describe, expect, test } from 'bun:test'
import {
  MATT_EMAIL,
  PROGRESS_THINKING,
  PROGRESS_WORKING,
  PROGRESS_WRITING,
  RATE_LIMIT_NOTICE,
  progressReading,
  progressSummary,
} from './copy'

/**
 * The copy is Matt's, so these tests pin the shape rather than the voice:
 * a sentence assembled from pieces has to read as a sentence, and the two
 * counts the assistant reports have to agree with English.
 */

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
    expect(progressSummary(1, 9)).toBe('Read 1 document in 9s')
    expect(progressSummary(3, 14)).toBe('Read 3 documents in 14s')
    expect(progressSummary(2, 1)).toBe('Read 2 documents in 1s')
  })

  test('names the document it is reading, and nothing else', () => {
    expect(progressReading('Résumé')).toBe('Reading Résumé…')
  })

  test('the spoken and written forms differ only by the ellipsis', () => {
    // lib/chat/answer.ts speaks "Reading {title}" and "Writing answer" to a
    // screen reader from its own literals, because it may not import this
    // module. This is the tripwire for the two drifting apart.
    expect(progressReading('Résumé')).toBe(`${'Reading Résumé'}…`)
    expect(PROGRESS_WRITING).toBe(`${'Writing answer'}…`)
  })

  test('the in-flight header is Working, not a repeat of the active row', () => {
    expect(PROGRESS_WORKING).toBe('Working…')
    expect(PROGRESS_THINKING).toBe('Thinking…')
  })
})

describe('the assistant never speaks as Matt', () => {
  test('the email is his, and the voice is about him', () => {
    expect(MATT_EMAIL).toBe('matt.trifilo@gmail.com')
    expect(RATE_LIMIT_NOTICE.lead).toContain("Matt's")
  })
})
