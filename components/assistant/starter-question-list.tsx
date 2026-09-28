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
 * edge. The group headings are plain text in reading order, inside the
 * ticker's one named group, so a screen reader meets the list as it meets
 * the rows: one group of questions, not a landmark per theme.
 */

/** A property of the pool, so computed once rather than per render. */
const GROUPS = starterGroups()

export function StarterQuestionList({
  onPick,
}: {
  onPick: (question: string) => void
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      {GROUPS.map(group => (
        <div className="flex flex-col gap-2" key={group.key}>
          <p className="text-[11px] leading-[1.3] font-medium text-muted-foreground uppercase">
            {group.heading}
          </p>
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
