'use client'

import type { Ref } from 'react'
import type { StarterSource } from './analytics'
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
 * simply stops taking up room. It is focusable by script only: a new
 * conversation started by touch puts focus there rather than in the
 * composer, so a phone's keyboard stays down.
 */
export function AssistantEmptyState({
  headingRef,
  onListOpen,
  onPick,
}: {
  headingRef?: Ref<HTMLHeadingElement>
  onListOpen?: () => void
  onPick: (question: string, source: StarterSource) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1
          className="font-semibold text-section-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {ASSISTANT_NAME}
        </h1>
        <p className="max-w-xl leading-relaxed text-muted-foreground">
          {ASSISTANT_INTRO}
        </p>
      </div>
      <StarterTicker
        // The page's h1 above names the assistant.
        listHeadingLevel={2}
        onListOpen={onListOpen}
        onPick={onPick}
        startAt={ASK_START_AT}
      />
    </div>
  )
}
