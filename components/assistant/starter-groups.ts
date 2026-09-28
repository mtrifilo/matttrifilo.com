import { FEATURED_THEMES, type FeaturedThemeKey } from '@/lib/chat/featuring'
import {
  STARTER_HEAD_THEMES,
  STARTER_QUESTIONS,
  STARTER_THEME_HEADINGS,
  STARTER_UNTAGGED_HEADING,
} from './copy'

/**
 * The starter questions as the "see all" list shows them (MTC-85): one
 * group per featured theme, in the featuring order, then the questions no
 * theme claims.
 *
 * The tags are the pool's own (STARTER_HEAD_THEMES), not a second taxonomy:
 * which theme a question belongs to is Matt's call, and a question he has
 * not tagged is shown under the untagged heading rather than guessed into a
 * theme. Within a group the questions keep the pool's order, which is the
 * order he approved.
 */

export interface StarterGroup {
  /** A featured theme's key, or `untagged` for the questions none claims. */
  key: FeaturedThemeKey | 'untagged'
  heading: string
  questions: readonly string[]
}

/**
 * Every question exactly once. A theme with no question in the pool is left
 * out rather than shown as a heading over nothing, and so is the untagged
 * group when every question has a theme.
 */
export function starterGroups(
  questions: readonly string[] = STARTER_QUESTIONS,
  themes: Partial<Record<string, FeaturedThemeKey>> = STARTER_HEAD_THEMES
): StarterGroup[] {
  const themed: StarterGroup[] = FEATURED_THEMES.map(theme => ({
    key: theme.key,
    heading: STARTER_THEME_HEADINGS[theme.key],
    questions: questions.filter(question => themes[question] === theme.key),
  }))
  const untagged: StarterGroup = {
    key: 'untagged',
    heading: STARTER_UNTAGGED_HEADING,
    questions: questions.filter(question => themes[question] === undefined),
  }
  return [...themed, untagged].filter(group => group.questions.length > 0)
}
