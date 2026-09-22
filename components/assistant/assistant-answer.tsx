'use client'

import { Check, Copy, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Suggestion } from '@/components/ai-elements/suggestion'
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
   * Asks one of the proposed follow-ups. Given only for the last answer of a
   * run that ended on its own, so an earlier turn keeps no row and a run the
   * visitor stopped offers nothing to carry on with.
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

      {/* A decline carries no proposals, and a run that did not finish is not
          asked to suggest anything, so both of those end up here as an empty
          list rather than as conditions of their own. */}
      {onFollowUp && !pending && !view.incomplete && (
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
 * starter ticker's edge fades and its scroll padding, so a pill reached by
 * keyboard is scrolled clear of the gradient rather than under it, and it
 * borrows none of the motion: there is no track and no loop, only a scroll
 * box the visitor drags.
 *
 * It grows into place instead of appearing at full height, so the answer
 * above it is not jolted the moment the run ends. app/globals.css owns that,
 * and drops it for a visitor who asked for no motion.
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
    <div
      aria-label={FOLLOW_UPS_LABEL}
      // The vertical padding is room for a focus ring the row would
      // otherwise clip; the negative margin gives it back to the layout.
      className="edge-faded-row follow-up-row -my-1 w-full py-1"
      role="group"
    >
      <div className="flex w-max items-start gap-2">
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
