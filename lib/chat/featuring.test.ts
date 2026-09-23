import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  FEATURED_THEMES,
  FOLLOW_UP_FEATURING_RULE,
  TABLE_STAKES_PRACTICE,
} from './featuring'
import { SYSTEM_PROMPT } from './prompt'

/**
 * The featuring order has one list in code and one paragraph of prose in the
 * repository skill. These tests hold the prompt to the list byte for byte and
 * the skill to the list in order, so a change to either that skips the other
 * fails `bun test`.
 */

const SKILL_PATH = new URL(
  '../../.claude/skills/career-assistant-context/SKILL.md',
  import.meta.url
)

/**
 * The skill's featuring rule opens with this bold lead. The test reads the
 * one line that carries it, so rewording the lead fails here by name rather
 * than silently matching some other paragraph.
 */
const SKILL_FEATURING_LEAD =
  '**Lead with what was unusually impactful, in this order**'

function skillFeaturingParagraph(): string {
  const lines = readFileSync(SKILL_PATH, 'utf8')
    .split('\n')
    .filter(line => line.includes(SKILL_FEATURING_LEAD))
  expect(lines, 'lines carrying the featuring lead in SKILL.md').toHaveLength(1)
  return lines[0]
}

describe('the follow-up policy renders the featuring order', () => {
  test('the sentence is exactly the wording the policy has always had', () => {
    // A snapshot of the wording, so a change to a label is a visible,
    // deliberate edit to this literal and not a quiet change to the prompt.
    expect(FOLLOW_UP_FEATURING_RULE).toBe(
      "Lead towards what was unusually impactful, in this order: the measured delivery change from Matt's adoption of AI coding agents, with the confounders; the product and platform outcomes he shipped; the operational ownership he holds at scale; how he led AI adoption across an organisation. Practices most companies already have, independent deployment among them, are supporting detail, so suggest them last or not at all."
    )
  })

  test('the system prompt carries the rendered sentence as one bullet', () => {
    expect(SYSTEM_PROMPT).toContain(`\n- ${FOLLOW_UP_FEATURING_RULE}\n`)
  })
})

describe('the list itself', () => {
  test('names four distinct themes, with the table-stakes practice outside them', () => {
    const keys: readonly string[] = FEATURED_THEMES.map(theme => theme.key)
    expect(keys).toHaveLength(4)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain(TABLE_STAKES_PRACTICE.key)
  })
})

describe('the skill agrees with the list', () => {
  test('names the four themes in the same order', () => {
    const paragraph = skillFeaturingParagraph()
    const positions = FEATURED_THEMES.map(theme => ({
      key: theme.key,
      at: paragraph.indexOf(theme.skillPhrase),
    }))
    for (const { key, at } of positions) {
      expect(
        at,
        `${key} in the skill's featuring paragraph`
      ).toBeGreaterThanOrEqual(0)
    }
    const found = positions.map(({ key }) => key)
    const inSkillOrder = [...positions]
      .sort((a, b) => a.at - b.at)
      .map(({ key }) => key)
    expect(inSkillOrder).toEqual(found)
  })

  test('names independent deployment as supporting detail, never a headline', () => {
    const paragraph = skillFeaturingParagraph()
    const tableStakes = paragraph.indexOf(TABLE_STAKES_PRACTICE.skillPhrase)
    expect(tableStakes).toBeGreaterThan(
      paragraph.indexOf(FEATURED_THEMES[FEATURED_THEMES.length - 1].skillPhrase)
    )
    expect(paragraph.slice(tableStakes)).toContain('never a headline')
  })
})
