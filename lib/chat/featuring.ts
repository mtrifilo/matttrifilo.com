/**
 * The order in which the Career Assistant features Matt's work (Matt,
 * 2026-09-22, MTC-41's binding content rule).
 *
 * This is the list; `.claude/skills/career-assistant-context/SKILL.md` keeps
 * the prose. The follow-up policy in `prompt.ts` renders its ordered sentence
 * from this module, and `featuring.test.ts` fails when the skill names the
 * themes in a different order, so the order is changed here and in the skill
 * together, never in the prompt's text.
 *
 * Pure data with no imports: anything that orders or ranks Matt's work may
 * read it, including modules that cannot import the prompt, which reads the
 * filesystem through the knowledge index.
 */

export interface FeaturedTheme {
  /** A short, stable name for code that maps onto the order. */
  key: string
  /**
   * The words the follow-up policy uses for the theme. Rendered into the
   * system prompt verbatim, so a change here changes what the model is told.
   */
  promptLabel: string
  /**
   * The words the skill uses for the theme. The skill and the prompt phrase
   * the same four themes differently, and this is the phrase the test looks
   * for in the skill's featuring paragraph.
   */
  skillPhrase: string
  /** What the theme covers, in the examples Matt gave when he set the order. */
  description: string
}

/** The themes to lead with, most important first. */
export const FEATURED_THEMES = [
  {
    key: 'measuredDelivery',
    promptLabel:
      "the measured delivery change from Matt's adoption of AI coding agents, with the confounders",
    skillPhrase: 'the measured delivery change from AI adoption',
    description:
      'Lead time, pull requests per week, defect backlog, and review volume after adopting AI coding agents, with the confounders.',
  },
  {
    key: 'productOutcomes',
    promptLabel: 'the product and platform outcomes he shipped',
    skillPhrase: 'product and platform outcomes',
    description:
      'The AI Email Engagement Summary, Symphony, the Black Friday record, the compliance migration.',
  },
  {
    key: 'operationalOwnership',
    promptLabel: 'the operational ownership he holds at scale',
    skillPhrase: 'operational ownership at scale',
    description:
      'An email service provider sending up to a billion messages a month, 24/7 on-call, the 2024 outage.',
  },
  {
    key: 'orgAiAdoption',
    promptLabel: 'how he led AI adoption across an organisation',
    skillPhrase: 'leading AI adoption across the organisation',
    description: 'Leading AI adoption across the engineering organisation.',
  },
] as const satisfies readonly FeaturedTheme[]

export type FeaturedThemeKey = (typeof FEATURED_THEMES)[number]['key']

/**
 * The practice named as supporting detail, never a headline. It is listed so
 * the exclusion is as deliberate as the order: independent deploys are table
 * stakes at most companies, so leading with them undersells the outcomes
 * above.
 */
export const TABLE_STAKES_PRACTICE = {
  key: 'independentDeploys',
  promptLabel: 'independent deployment',
  skillPhrase: 'independent deployment',
  reason:
    'Most companies already deploy services independently, so it supports a story and never leads one.',
} as const

/**
 * The follow-up policy's ordering rule, one bullet of `SYSTEM_PROMPT` without
 * its leading "- ". Its bytes are pinned by `featuring.test.ts`, because the
 * prompt prefix is what Vertex's implicit cache keys on.
 */
export const FOLLOW_UP_FEATURING_RULE = `Lead towards what was unusually impactful, in this order: ${FEATURED_THEMES.map(
  theme => theme.promptLabel
).join(
  '; '
)}. Practices most companies already have, ${TABLE_STAKES_PRACTICE.promptLabel} among them, are supporting detail, so suggest them last or not at all.`
