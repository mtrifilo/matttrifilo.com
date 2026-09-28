import { FEATURED_THEMES, type FeaturedThemeKey } from '@/lib/chat/featuring'
import {
  STARTER_LIST_THEMES,
  STARTER_QUESTIONS,
  STARTER_THEME_HEADINGS,
  STARTER_UNTAGGED_HEADING,
} from './copy'

/**
 * The starter questions as the "see all" list shows them (MTC-85): one
 * group per featured theme, in the featuring order, then the questions no
 * theme claims.
 *
 * Which theme a question is listed under is Matt's (STARTER_LIST_THEMES in
 * copy.ts), not a guess made here: a question he has not placed is shown
 * under the untagged heading. Within a group the questions keep the pool's
 * order, which is the order he approved.
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
 * group when every question has a theme. A question the map lists as `null`
 * and one it does not list at all are both untagged.
 */
export function starterGroups(
  questions: readonly string[] = STARTER_QUESTIONS,
  themes: Partial<Record<string, FeaturedThemeKey | null>> = STARTER_LIST_THEMES
): StarterGroup[] {
  const themeOf = (question: string) => themes[question] ?? null
  const themed: StarterGroup[] = FEATURED_THEMES.map(theme => ({
    key: theme.key,
    heading: STARTER_THEME_HEADINGS[theme.key],
    questions: questions.filter(question => themeOf(question) === theme.key),
  }))
  const untagged: StarterGroup = {
    key: 'untagged',
    heading: STARTER_UNTAGGED_HEADING,
    questions: questions.filter(question => themeOf(question) === null),
  }
  return [...themed, untagged].filter(group => group.questions.length > 0)
}
