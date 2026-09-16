'use client'

import { Check, Copy, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'
import { noticeFor, type AnswerView } from '@/lib/chat/answer'
import { IncompleteNotice, TruncatedNotice } from './assistant-notice'
import { AssistantProgress } from './assistant-progress'

/**
 * One assistant turn: the answer, what it was drawn from, and what can be
 * done with it.
 *
 * The order is deliberate. What the assistant did to prepare the answer comes
 * first, because it is the only thing on screen for the ten to twenty seconds
 * before the first token, and afterwards it is one collapsed line above the
 * answer it explains: the documents it read, by title, which is what makes
 * the answer checkable. Then the answer, then any notice about how it ended,
 * then the actions.
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
}

export function AssistantAnswer({
  view,
  pending,
  elapsedMs,
  actions,
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
    </>
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
