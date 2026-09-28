import { describe, expect, test } from 'bun:test'
import { FEATURED_THEMES } from '@/lib/chat/featuring'
import {
  STARTER_LIST_THEMES,
  STARTER_QUESTIONS,
  STARTER_THEME_HEADINGS,
  STARTER_UNTAGGED_HEADING,
} from './copy'
import { starterGroups } from './starter-groups'

/**
 * The "see all" list's grouping (MTC-85): every question once, under the
 * theme Matt placed it in, in the featuring order, the rest last. The
 * list's markup is tested in starter-ticker.test.tsx; this is the
 * arithmetic, and the assignment itself.
 */

/**
 * Matt's assignment as he approved it (MTC-85, binding 2026-09-28: the
 * orchestrator's "Grouping fork" draft, used as posted), written out here
 * rather than read from copy.ts, so a changed entry there fails until it is
 * changed here on purpose.
 */
const APPROVED_GROUPS: Readonly<Record<string, readonly string[]>> = {
  measuredDelivery: [
    "What measurable results did Matt's team get from adopting AI coding agents?",
    'How does Matt keep quality high when AI agents write most of the code?',
    "How did Matt's team move to independent deploys, and how long did it take?",
  ],
  productOutcomes: [
    'What is the AI Email Engagement Summary feature Matt built?',
    'What is Symphony, and what did Matt do with it?',
    "What was Matt's part in breaking the Keap monolith into services?",
  ],
  operationalOwnership: [
    "What does Matt's Email Reliability team own at Thryv?",
    'How does Matt run 24/7 on-call for an email service provider?',
    'How does Matt prepare email sending for Black Friday and Cyber Monday?',
    'How did Matt handle the February 2024 cloud-provider outage?',
    'What languages, frameworks, and infrastructure do Matt and his team use?',
  ],
  orgAiAdoption: [
    "How did Matt roll out AI tooling and best practices across Thryv's engineering org?",
    'How does Matt use AI coding agents?',
    "How does Matt think the engineer's job changes when agents write the code?",
    'How does Matt manage the cost of AI tooling?',
    'How did Matt handle resistance to AI tools on the team?',
  ],
  untagged: [
    'How much code does Matt ship himself as an engineering manager?',
    'What did Matt ship recently?',
    "What is Matt's advice to junior engineers in 2026?",
    'What is decant, the CLI Matt open-sourced?',
    'What is Psychic Homily, and what is it built with?',
    'What awards and recognition has Matt received?',
    'Where is Matt based, and is he open to relocating?',
    'What did Matt do before software engineering?',
    'How has Matt led a team through an acquisition?',
    'What does Matt think good engineering leadership looks like?',
    'How does Matt build a team that keeps running without him?',
  ],
}

const APPROVED_QUESTIONS = Object.values(APPROVED_GROUPS).flat()

/** The map as plain strings, for lookups by any question. */
const listThemes: Partial<Record<string, string | null>> = STARTER_LIST_THEMES

describe("Matt's whole-pool assignment", () => {
  test('places each of the 27 approved questions exactly once', () => {
    expect(APPROVED_QUESTIONS).toHaveLength(27)
    expect(new Set(APPROVED_QUESTIONS).size).toBe(27)
  })

  test('the map says what Matt approved, question by question', () => {
    for (const [key, questions] of Object.entries(APPROVED_GROUPS)) {
      for (const question of questions) {
        expect(
          listThemes[question] ?? 'untagged',
          `${question} is listed under`
        ).toBe(key)
      }
    }
    // Explicitly, not by omission: every approved question is a key.
    for (const question of APPROVED_QUESTIONS) {
      expect(Object.hasOwn(STARTER_LIST_THEMES, question), question).toBe(true)
    }
    expect(Object.keys(STARTER_LIST_THEMES)).toHaveLength(27)
  })

  test('maps every question in the pool it was approved for, and nothing else', () => {
    // A key that is not a pool question is a typo or a retired question,
    // and would silently list nothing. A pool question missing from the map
    // is allowed only once the pool has grown past the approved 27.
    const pool: readonly string[] = STARTER_QUESTIONS
    for (const question of Object.keys(STARTER_LIST_THEMES)) {
      expect(pool, 'a mapped question is in the pool').toContain(question)
    }
    for (const question of APPROVED_QUESTIONS) {
      expect(pool, 'an approved question is still in the pool').toContain(
        question
      )
    }
  })
})

describe('the pool, grouped for the list', () => {
  const groups = starterGroups()

  test('shows every question in the pool exactly once', () => {
    const shown = groups.flatMap(group => group.questions)
    expect(shown).toHaveLength(STARTER_QUESTIONS.length)
    expect(new Set(shown)).toEqual(new Set(STARTER_QUESTIONS))
  })

  test('holds 3, 3, 5 and 5 under the themes in the featuring order, then 11 under More', () => {
    expect(groups.map(group => group.key)).toEqual([
      ...FEATURED_THEMES.map(theme => theme.key),
      'untagged',
    ])
    expect(groups.map(group => group.questions.length)).toEqual([
      3, 3, 5, 5, 11,
    ])
  })

  test('puts each question in the group Matt placed it in', () => {
    for (const group of groups) {
      expect(new Set(group.questions)).toEqual(
        new Set(APPROVED_GROUPS[group.key])
      )
    }
  })

  test("keeps the pool's order inside each group", () => {
    const position = (question: string) =>
      (STARTER_QUESTIONS as readonly string[]).indexOf(question)
    for (const group of groups) {
      const positions = group.questions.map(position)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  test('heads each group with its copy', () => {
    for (const group of groups) {
      expect(group.heading).toBe(
        group.key === 'untagged'
          ? STARTER_UNTAGGED_HEADING
          : STARTER_THEME_HEADINGS[group.key]
      )
    }
  })

  test('lists a question the map does not place under More, after the placed ones', () => {
    // A pill added to the pool later appears at once, under More, until
    // Matt places it.
    const added = 'A question added after the map was approved?'
    const grown = starterGroups([...STARTER_QUESTIONS, added])
    const more = grown.at(-1)
    expect(more?.key).toBe('untagged')
    expect(more?.questions.at(-1)).toBe(added)
    expect(grown.flatMap(group => group.questions)).toHaveLength(
      STARTER_QUESTIONS.length + 1
    )
  })

  test('shows no heading over nothing', () => {
    // A theme no question carries, and an untagged group when every
    // question has a theme, would be headings with no pills under them.
    const onlyTagged = starterGroups(['a', 'b'], {
      a: 'measuredDelivery',
      b: 'orgAiAdoption',
    })
    expect(onlyTagged.map(group => group.key)).toEqual([
      'measuredDelivery',
      'orgAiAdoption',
    ])
    expect(starterGroups(['a', 'b'], { a: null }).map(g => g.key)).toEqual([
      'untagged',
    ])
  })
})
