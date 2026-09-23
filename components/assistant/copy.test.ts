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
 * Matt approved the twenty-seven questions (MTC-39), and their order follows
 * the featured themes (MTC-76), so these hold the shape rather than the
 * wording: a duplicate would give
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
   * The untagged questions the head holds, in the relative order they keep
   * after the themed ones: the pool's approved order (MTC-39), kept by the
   * orchestrator's default on MTC-76 (2026-09-23, Matt may override).
   * Tagging one with a theme takes it out of the check below rather than
   * breaking it; a question joining or leaving the head, or a change to their
   * order, is a change to this list.
   */
  const APPROVED_UNTAGGED_HEAD_ORDER = [
    'How does Matt use AI coding agents?',
    'How does Matt keep quality high when AI agents write most of the code?',
    'How much code does Matt ship himself as an engineering manager?',
    'What did Matt ship recently?',
  ]

  /**
   * Where the table-stakes question stays: Matt's "stays where it is
   * (position 10)" (MTC-41, 2026-09-22) counts from one, so it is the tenth
   * question of the pool.
   */
  const TABLE_STAKES_INDEX = 9

  // The pool's first question is not pinned: each row's head opens on the
  // featured themes (Matt, 2026-09-23, MTC-76), so index 0 holds whichever
  // themed question leads.

  const themes: Partial<Record<string, FeaturedThemeKey>> = STARTER_HEAD_THEMES
  const isTagged = (question: string) => themes[question] !== undefined
  const themeRank = (question: string) =>
    FEATURED_THEMES.findIndex(theme => theme.key === themes[question])

  // Each row's head: what the homepage shows first, from the pill it opens on.
  const rowHeads = tickerRows(STARTER_QUESTIONS).map(row =>
    Array.from(
      { length: STARTER_HEAD_PILLS_PER_ROW },
      (_, pill) => row[pillIndexFor(HOME_START_AT + pill, row.length)]
    )
  )

  // The head is read one pill from each row in turn, first row first. This is
  // a chosen convention for the order a visitor meets the themes, not a
  // measured reading pattern: the rows scroll on their own and their pills
  // differ in width. Under the ticker's odd and even split it is pool order.
  const head = Array.from({ length: STARTER_HEAD_PILLS_PER_ROW }, (_, pill) =>
    rowHeads.map(rowHead => rowHead[pill])
  ).flat()

  // A failure lists the questions with their themes, so it shows which
  // question sits where rather than only which theme is out of place.
  const byTheme = (run: readonly string[]) =>
    [
      `featuring order: ${FEATURED_THEMES.map(theme => theme.key).join(', ')}`,
      ...run.map(question => `${themes[question] ?? 'untagged'}: ${question}`),
    ].join('\n')

  // More than one question may carry a theme, so order means the themes
  // never go backwards, not one question per theme.
  const themesNeverGoBackwards = (run: readonly string[]) =>
    run
      .filter(isTagged)
      .map(themeRank)
      .every((rank, index, ranks) => index === 0 || rank >= ranks[index - 1])

  test('every tagged question sits in the head', () => {
    for (const question of Object.keys(themes)) {
      expect(head, 'a tagged question sits in the head').toContain(question)
    }
  })

  test('the head carries every featured theme', () => {
    const covered = new Set(
      head.filter(isTagged).map(question => themes[question])
    )
    for (const theme of FEATURED_THEMES) {
      expect(covered.has(theme.key), `${theme.key} in:\n${byTheme(head)}`).toBe(
        true
      )
    }
  })

  test("each row's head opens on its themed questions, in the featuring order", () => {
    // Matt, 2026-09-23, MTC-76: each row's head opens with the featured
    // themes in order, and the untagged questions follow the tagged ones.
    for (const rowHead of rowHeads) {
      const tagged = rowHead.filter(isTagged)
      expect(
        tagged.length,
        `a theme opens:\n${byTheme(rowHead)}`
      ).toBeGreaterThan(0)
      expect(
        rowHead.slice(0, tagged.length),
        `themed questions first:\n${byTheme(rowHead)}`
      ).toEqual(tagged)
      expect(
        themesNeverGoBackwards(rowHead),
        `themes in order:\n${byTheme(rowHead)}`
      ).toBe(true)
    }
  })

  test('reading across the rows, the themes never go backwards', () => {
    expect(head.some(isTagged), 'the head carries a theme').toBe(true)
    expect(themesNeverGoBackwards(head), byTheme(head)).toBe(true)
  })

  test('the untagged head is the approved set, in the approved order', () => {
    const untaggedInPoolOrder = questions.filter(
      question => head.includes(question) && !isTagged(question)
    )
    expect(
      untaggedInPoolOrder,
      `the untagged head against APPROVED_UNTAGGED_HEAD_ORDER:\n${byTheme(head)}`
    ).toEqual(
      APPROVED_UNTAGGED_HEAD_ORDER.filter(question => !isTagged(question))
    )
  })

  test('keeps the table-stakes question out of the head', () => {
    expect(questions).toContain(STARTER_TABLE_STAKES_QUESTION)
    expect(head).not.toContain(STARTER_TABLE_STAKES_QUESTION)
  })

  test('keeps the table-stakes question where Matt pinned it', () => {
    expect(questions.indexOf(STARTER_TABLE_STAKES_QUESTION)).toBe(
      TABLE_STAKES_INDEX
    )
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
