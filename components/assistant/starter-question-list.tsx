'use client'

import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { starterGroups } from './starter-groups'

/**
 * Every starter question at once, grouped by featured theme (MTC-85).
 *
 * The rows show the pool's breadth by moving; this shows all of it still,
 * for a visitor with seconds to spare who wants to pick the one question
 * they came with. It is the same pill as the rows', asking through the same
 * `onPick`, so a question behaves the same wherever it was picked from.
 *
 * Here the pills keep the component's defaults and wrap: nothing moves, so
 * a long question can take a second line rather than run past a phone's
 * edge. The groups stay inside the ticker's one named group, so a screen
 * reader meets the list as it meets the rows: one group of questions, not a
 * landmark per theme.
 *
 * Each theme's label is a real heading (MTC-97), so a screen-reader visitor
 * can jump from theme to theme. Its level is one below the heading that
 * names the assistant on the surface showing it, which only the surface
 * knows. The style is Matt's decision of 2026-09-28: 14 px, semibold,
 * sentence case, the foreground color, so the label reads at the pills'
 * scale. Groups sit 1.5 rem apart and a label 0.5 rem above its pills, so
 * each label reads as the title of the group under it rather than a caption
 * of the one above.
 */

export type StarterListHeadingLevel = 2 | 3

/** A property of the pool, so computed once rather than per render. */
const GROUPS = starterGroups()

export function StarterQuestionList({
  headingLevel,
  onPick,
}: {
  headingLevel: StarterListHeadingLevel
  onPick: (question: string) => void
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <div className="flex w-full flex-col gap-6">
      {GROUPS.map(group => (
        <div className="flex flex-col gap-2" key={group.key}>
          <Heading className="text-sm leading-[1.3] font-semibold text-foreground">
            {group.heading}
          </Heading>
          <Suggestions>
            {group.questions.map(question => (
              <Suggestion
                key={question}
                onClick={onPick}
                suggestion={question}
              />
            ))}
          </Suggestions>
        </div>
      ))}
    </div>
  )
}
