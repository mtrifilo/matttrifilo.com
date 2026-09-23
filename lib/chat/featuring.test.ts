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

/**
 * The skill's featuring paragraph, split where the tests need it: the themes
 * it lists after the lead's parenthetical, one per comma, and the sentence
 * that follows the list, which names the table-stakes practice.
 */
function skillFeaturing(): { themes: string[]; afterList: string } {
  const lines = readFileSync(SKILL_PATH, 'utf8')
    .split('\n')
    .filter(line => line.includes(SKILL_FEATURING_LEAD))
  expect(lines, 'lines carrying the featuring lead in SKILL.md').toHaveLength(1)
  const listStart = lines[0].indexOf('): ')
  expect(listStart, "the list after the lead's parenthetical").toBeGreaterThan(
    0
  )
  const rest = lines[0].slice(listStart + '): '.length)
  const listEnd = rest.indexOf('. ')
  expect(listEnd, 'the full stop that ends the list').toBeGreaterThan(0)
  return {
    themes: rest.slice(0, listEnd).split(', '),
    afterList: rest.slice(listEnd + '. '.length),
  }
}

describe('the follow-up policy renders the featuring order', () => {
  test('renders the pinned sentence byte for byte', () => {
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
  test('keys are distinct, and the table-stakes practice is not among them', () => {
    const keys: readonly string[] = FEATURED_THEMES.map(theme => theme.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain(TABLE_STAKES_PRACTICE.key)
  })
})

describe('the skill agrees with the list', () => {
  test('lists exactly the same themes, in the same order', () => {
    // A mismatch here means the order changed in one place only: change
    // FEATURED_THEMES in lib/chat/featuring.ts and the skill's paragraph
    // together.
    expect(skillFeaturing().themes).toEqual(
      FEATURED_THEMES.map(theme => theme.skillPhrase)
    )
  })

  test('names independent deployment as supporting detail, never a headline', () => {
    const { afterList } = skillFeaturing()
    const tableStakes = afterList.indexOf(TABLE_STAKES_PRACTICE.skillPhrase)
    expect(tableStakes).toBeGreaterThanOrEqual(0)
    expect(afterList.slice(tableStakes)).toContain('never a headline')
  })
})
