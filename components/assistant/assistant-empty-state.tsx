'use client'

import { ASSISTANT_INTRO, ASSISTANT_NAME } from './copy'
import { StarterTicker } from './starter-ticker'
import { ASK_START_AT } from './ticker-geometry'

/**
 * What /ask shows before the first question (MTC-55).
 *
 * It is the top of one centred group: the title, the one-line intro and the
 * two ticker rows, with the composer and the disclosure directly under them.
 * The composer is not a child here, because it is the same element before and
 * after the first send and moving it between parents would cost the caret and
 * the draft; assistant-chat.tsx centres the group around it with a flexible
 * space above and below instead.
 *
 * The heading is the page's `h1`. Once a conversation exists it survives as a
 * visually hidden one, so the page never loses its heading, and the group
 * simply stops taking up room.
 */
export function AssistantEmptyState({
  onPick,
}: {
  onPick: (question: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1
          className="font-semibold"
          style={{ fontSize: 'clamp(1.5rem, 3vw + 0.25rem, 2rem)' }}
        >
          {ASSISTANT_NAME}
        </h1>
        <p className="max-w-xl leading-relaxed text-muted-foreground">
          {ASSISTANT_INTRO}
        </p>
      </div>
      <StarterTicker onPick={onPick} startAt={ASK_START_AT} />
    </div>
  )
}
