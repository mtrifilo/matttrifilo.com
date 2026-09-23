import { describe, expect, test } from 'bun:test'
import { announcementFor } from '@/lib/chat/answer'
import { FEATURED_THEMES, type FeaturedThemeKey } from '@/lib/chat/featuring'
import { READ_DOCUMENT_TOOL_NAME } from '@/lib/chat/prompt'
import { PROGRESS_TOPICS, type ProgressView } from '@/lib/chat/progress'
import {
  MATT_EMAIL,
  PROGRESS_THINKING,
  PROGRESS_TOOL_NAME,
  PROGRESS_WRITING,
  RATE_LIMIT_NOTICE,
  STARTER_QUESTIONS,
  STARTER_HEAD_PILLS_PER_ROW,
  STARTER_HEAD_THEMES,
  STARTER_TABLE_STAKES_QUESTION,
  progressChecking,
  progressHeadings,
  progressReading,
  progressSummary,
  progressTopic,
} from './copy'
import { HOME_START_AT, pillIndexFor, tickerRows } from './ticker-geometry'

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

  /**
   * The question both rows open behind: the first pill of the first row.
   * Where the pool opens is the product decision, so it is pinned here.
   */
  const OPENING_QUESTION = 'How does Matt use AI coding agents?'

  /**
   * Where Matt pinned the table-stakes question: the tenth question of the
   * pool, which is where it stood when he pinned it.
   */
  const TABLE_STAKES_INDEX = 9

  // The head is what the homepage shows first, in the order a visitor reads
  // two rows: the pill each row opens on, first row then second, then the
  // next pill of each, for the pills counted as the head.
  const rows = tickerRows(STARTER_QUESTIONS)
  const head = Array.from({ length: STARTER_HEAD_PILLS_PER_ROW }, (_, pill) =>
    rows.map(row => row[pillIndexFor(HOME_START_AT + pill, row.length)])
  ).flat()

  const themes: Partial<Record<string, FeaturedThemeKey>> = STARTER_HEAD_THEMES
  const themed = head.filter(question => themes[question] !== undefined)

  test('every tagged question sits in the head', () => {
    for (const question of Object.keys(themes)) {
      expect(head, 'a tagged question sits in the head').toContain(question)
    }
  })

  test('the head meets the featured themes in the featuring order', () => {
    expect(themed.map(question => themes[question])).toEqual(
      FEATURED_THEMES.map(theme => theme.key)
    )
  })

  test('only the opening question comes before the featured themes', () => {
    // The themed questions lead each row's head; the untagged ones follow
    // them. The opening question is the one exception, because it is pinned.
    const lastThemed = Math.max(
      ...themed.map(question => head.indexOf(question))
    )
    const untaggedAhead = head
      .slice(0, lastThemed + 1)
      .filter(question => themes[question] === undefined)
      .filter(question => question !== OPENING_QUESTION)
    expect(untaggedAhead).toEqual([])
  })

  test('keeps the table-stakes question out of the head, where Matt pinned it', () => {
    expect(questions.indexOf(STARTER_TABLE_STAKES_QUESTION)).toBe(
      TABLE_STAKES_INDEX
    )
    expect(head).not.toContain(STARTER_TABLE_STAKES_QUESTION)
  })

  // The pool no longer pins its first question: each row's head opens on
  // the featured themes (Matt, 2026-09-23, MTC-76), which supersedes the
  // opening question pinned with the pool (MTC-39, 2026-09-21).

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
  test('names the tool, and counts sources in English', () => {
    // Matt's wording, 2026-09-22: most visitors never open the panel, so
    // the collapsed line is where the tool call is visible.
    expect(progressSummary(1, 0, 9)).toBe(
      'Used read_document on 1 source in 9s'
    )
    expect(progressSummary(3, 0, 14)).toBe(
      'Used read_document on 3 sources in 14s'
    )
    expect(progressSummary(2, 0, 1)).toBe(
      'Used read_document on 2 sources in 1s'
    )
  })

  test('spells the tool the way the route registers it', () => {
    // This file may not import lib/chat/prompt.ts at runtime, so the name is
    // written out twice. This is the tripwire for the two drifting apart.
    expect(PROGRESS_TOOL_NAME).toBe(READ_DOCUMENT_TOOL_NAME)
  })

  test('counts a GitHub check apart from the documents', () => {
    // A check is not a read, and the one line that stands in for the whole
    // run must not call it one.
    expect(progressSummary(2, 1, 11)).toBe(
      'Used read_document on 2 sources and checked GitHub in 11s'
    )
    expect(progressSummary(1, 1, 8)).toBe(
      'Used read_document on 1 source and checked GitHub in 8s'
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

  test('every corpus topic a row can carry has a label', () => {
    // The record is keyed by the closed set, so a missing label is a
    // typecheck failure; this is the guard on a label that is empty or is
    // still the slug the wire carries.
    for (const topic of PROGRESS_TOPICS) {
      const label = progressTopic(topic)
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toBe(topic)
    }
    expect(PROGRESS_TOPICS.map(progressTopic)).toEqual([
      'Résumé',
      'Career',
      'FAQ',
      'Open source',
      'Blog',
    ])
  })

  test('section titles are shown in the order the document has them', () => {
    expect(progressHeadings(['Headline ratios', "Matt's own output"])).toBe(
      "Headline ratios · Matt's own output"
    )
    expect(progressHeadings(['Only one'])).toBe('Only one')
  })
})

describe('the assistant never speaks as Matt', () => {
  test('the email is his, and the voice is about him', () => {
    expect(MATT_EMAIL).toBe('matt.trifilo@gmail.com')
    expect(RATE_LIMIT_NOTICE.lead).toContain("Matt's")
  })
})
