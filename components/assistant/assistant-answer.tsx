'use client'

import { Check, Copy, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { noticeFor, type AnswerView } from '@/lib/chat/answer'
import { IncompleteNotice, TruncatedNotice } from './assistant-notice'
import { AssistantProgress } from './assistant-progress'
import { FOLLOW_UPS_LABEL } from './copy'

/**
 * One assistant turn: the answer, what it was drawn from, and what can be
 * done with it.
 *
 * The order is deliberate. What the assistant did to prepare the answer comes
 * first, because it is the only thing on screen for the ten to twenty seconds
 * before the first token, and afterwards it is one collapsed line above the
 * answer it explains: the documents it read, by title, which is what makes
 * the answer checkable. Then the answer, then any notice about how it ended,
 * then the actions, and last the questions it proposes next, which sit
 * closest to the composer because that is where they lead.
 */

export interface AssistantAnswerProps {
  view: AnswerView
  /** True between sending and the first token: nothing to show but the wait. */
  pending: boolean
  /**
   * Milliseconds since the question was sent, for the progress timer. One
   * clock for the whole page, started in assistant-chat.tsx; earlier answers
   * are passed 0 and show the server's own duration instead.
   */
  elapsedMs: number
  /** Copy and regenerate are offered on the last answer only, once it is done. */
  actions?: { onRegenerate: () => void }
  /**
   * Asks one of the proposed follow-ups, when this answer is one that offers
   * any. Present or absent is the whole decision, and `showsFollowUps` in
   * lib/chat/answer.ts is where it is made and tested.
   */
  onFollowUp?: (question: string) => void
}

export function AssistantAnswer({
  view,
  pending,
  elapsedMs,
  actions,
  onFollowUp,
}: AssistantAnswerProps) {
  const hasText = view.text.trim().length > 0
  // Decided in lib/chat/answer.ts, where it is tested; nothing here is
  // reachable from bun test.
  const notice = pending ? null : noticeFor(view)

  return (
    <>
      {/* Renders nothing when the run narrated nothing, which is every
          answer written without a read and every refusal. */}
      <AssistantProgress elapsedMs={elapsedMs} pending={pending} view={view} />
      {hasText ? <MessageResponse>{view.text}</MessageResponse> : null}

      {notice === 'truncated' && <TruncatedNotice />}
      {notice === 'incomplete' && <IncompleteNotice />}

      {actions && hasText && (
        <AnswerActions onRegenerate={actions.onRegenerate} text={view.text} />
      )}

      {onFollowUp && (
        <FollowUpRow onPick={onFollowUp} questions={view.followUps} />
      )}
    </>
  )
}

/**
 * The questions the assistant proposes next, as one row that scrolls
 * sideways (MTC-41).
 *
 * It is the approved frame's row: a single line of pills between the answer
 * and the composer, clipped at the right edge, at every width. It shares the
 * starter ticker's fade width and its scroll padding, so a pill reached by
 * keyboard is scrolled clear of the gradient rather than under it, and it
 * borrows none of the motion: there is no track and no loop, only a scroll
 * box the visitor drags.
 *
 * The reveal wrapper is what keeps the answer above from being jolted when
 * the run ends: the row's real height is what animates, rather than the row
 * appearing at full size in one frame. app/globals.css owns that, and drops
 * it for a visitor who asked for no motion.
 */
function FollowUpRow({
  questions,
  onPick,
}: {
  questions: readonly string[]
  onPick: (question: string) => void
}) {
  if (questions.length === 0) return null

  return (
    // The negative margin sits out here so the reveal animates the row's own
    // box; the padding inside the row is room for a focus ring it would
    // otherwise clip.
    <div className="follow-up-reveal -my-1">
      <div
        aria-label={FOLLOW_UPS_LABEL}
        className="edge-faded-row follow-up-row w-full py-1"
        role="group"
      >
        <Suggestions className="w-max flex-nowrap">
          {questions.map(question => (
            // One line each, as the frame draws them: the row scrolls rather
            // than growing a second line, and a proposal long enough to need
            // one is the row's problem, not the answer's.
            <Suggestion
              className="max-w-none whitespace-nowrap"
              key={question}
              onClick={onPick}
              suggestion={question}
            />
          ))}
        </Suggestions>
      </div>
    </div>
  )
}

function AnswerActions({
  onRegenerate,
  text,
}: {
  onRegenerate: () => void
  text: string
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // No clipboard permission, or an insecure origin. The answer is on the
      // page and selectable; saying nothing beats an error about a convenience.
    }
  }, [text])

  return (
    <div className="flex items-center gap-5 text-sm text-muted-foreground">
      <button
        className="flex items-center gap-2 transition-colors hover:text-foreground"
        onClick={copy}
        type="button"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-3.5" />
        ) : (
          <Copy aria-hidden="true" className="size-3.5" />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        className="flex items-center gap-2 transition-colors hover:text-foreground"
        onClick={onRegenerate}
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
        Regenerate
      </button>
    </div>
  )
}
