import { describe, expect, test } from 'bun:test'
import { FEATURED_THEMES } from '@/lib/chat/featuring'
import {
  STARTER_HEAD_THEMES,
  STARTER_QUESTIONS,
  STARTER_THEME_HEADINGS,
  STARTER_UNTAGGED_HEADING,
} from './copy'
import { starterGroups } from './starter-groups'

/**
 * The "see all" list's grouping (MTC-85): every question once, under its
 * featured theme in the featuring order, the untagged ones last. The list's
 * markup is tested in starter-ticker.test.tsx; this is the arithmetic.
 */

describe('the pool, grouped for the list', () => {
  const groups = starterGroups()

  test('shows every question in the pool exactly once', () => {
    const shown = groups.flatMap(group => group.questions)
    expect(shown).toHaveLength(STARTER_QUESTIONS.length)
    expect(new Set(shown)).toEqual(new Set(STARTER_QUESTIONS))
  })

  test('puts each tagged question under its own theme, and nothing else there', () => {
    const tags: Partial<Record<string, string>> = STARTER_HEAD_THEMES
    for (const group of groups) {
      for (const question of group.questions) {
        expect(tags[question] ?? 'untagged').toBe(group.key)
      }
    }
  })

  test('orders the themes as the featuring order does, with the untagged last', () => {
    const featuredOrder = FEATURED_THEMES.map(theme => theme.key)
    const keys = groups.map(group => group.key)
    expect(keys.at(-1)).toBe('untagged')
    const themed = keys.slice(0, -1)
    expect(themed).toEqual(featuredOrder.filter(key => themed.includes(key)))
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
    expect(starterGroups(['a'], {}).map(group => group.key)).toEqual([
      'untagged',
    ])
  })
})
