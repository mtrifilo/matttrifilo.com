'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { AssistantComposer } from './assistant-composer'
import { AssistantDisclosure } from './assistant-disclosure'
import { AssistantHeader } from './assistant-header'
import { ASSISTANT_INTRO, ASSISTANT_NAME } from './copy'
import { handOffQuestion, type PendingQuestion } from './pending-question'
import { usePickPointer } from './pointer'
import { StarterTicker } from './starter-ticker'
import { HOME_START_AT } from './ticker-geometry'

/**
 * The assistant's doorway on the homepage (MTC-33).
 *
 * It looks like the real thing and behaves like one input: a question typed
 * here, or a starter question tapped here, opens /ask with the answer already
 * arriving. What it deliberately is not is a second chat: one transcript, one
 * place, so a visitor never has half a conversation behind them on a page
 * about something else.
 */
export function HomeAssistantPanel() {
  const router = useRouter()
  return <RoutedHomeAssistantPanel router={router} />
}

/** The part of the app router the panel uses. */
export type PanelRouter = Pick<
  ReturnType<typeof useRouter>,
  'prefetch' | 'push'
>

/**
 * The panel itself, handed its router rather than reading it from context,
 * so a test can hand it one without reaching into Next.js internals for the
 * context the app router provides.
 */
export function RoutedHomeAssistantPanel({ router }: { router: PanelRouter }) {
  const [input, setInput] = useState('')

  // The panel's whole job is to send someone to /ask, so the route is worth
  // having in hand before they ask for it.
  useEffect(() => router.prefetch('/ask'), [router])

  const start = useCallback(
    (pending: PendingQuestion) => {
      handOffQuestion(pending)
      router.push('/ask')
    },
    [router]
  )

  // The tap happens here and the answer streams on /ask, so how the question
  // was picked travels with it: /ask keeps the keyboard down on arrival.
  const { pressHandlers, pickedByTouch } = usePickPointer()
  const pick = useCallback(
    (question: string) => start({ question, pickedByTouch: pickedByTouch() }),
    [pickedByTouch, start]
  )
  const submit = useCallback(
    (question: string) => start({ question, pickedByTouch: false }),
    [start]
  )

  return (
    <section
      aria-labelledby="career-assistant-heading"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
      {...pressHandlers}
    >
      <AssistantHeader />
      <h2 className="text-xl font-semibold" id="career-assistant-heading">
        {ASSISTANT_NAME}
      </h2>
      <p className="leading-relaxed text-muted-foreground">{ASSISTANT_INTRO}</p>
      <StarterTicker onPick={pick} startAt={HOME_START_AT} />
      <AssistantComposer
        onSubmit={submit}
        onValueChange={setInput}
        value={input}
      />
      <AssistantDisclosure />
    </section>
  )
}
