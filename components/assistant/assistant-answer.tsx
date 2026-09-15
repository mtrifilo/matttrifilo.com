'use client'

import { Check, Copy, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Source, Sources } from '@/components/ai-elements/sources'
import { noticeFor, type AnswerView } from '@/lib/chat/answer'
import { AnswerShimmer } from './answer-shimmer'
import { IncompleteNotice, TruncatedNotice } from './assistant-notice'

/**
 * One assistant turn: the answer, what it was drawn from, and what can be done
 * with it (MTC-33).
 *
 * The order is deliberate. The answer comes first, then the chips that make it
 * checkable, then any notice about how it ended, then the actions. A visitor
 * reading top to bottom meets the claim and its sources before anything asks
 * them to do something.
 */

export interface AssistantAnswerProps {
  view: AnswerView
  /** True between sending and the first token: nothing to show but the wait. */
  pending: boolean
  /** Copy and regenerate are offered on the last answer only, once it is done. */
  actions?: { onRegenerate: () => void }
}

export function AssistantAnswer({
  view,
  pending,
  actions,
}: AssistantAnswerProps) {
  const hasText = view.text.trim().length > 0
  // Decided in lib/chat/answer.ts, where it is tested; nothing here is
  // reachable from bun test.
  const notice = pending ? null : noticeFor(view)

  return (
    <>
      {hasText ? <MessageResponse>{view.text}</MessageResponse> : null}
      {pending && !hasText ? <AnswerShimmer /> : null}

      {view.sources.length > 0 && (
        <Sources>
          {view.sources.map(source => (
            <Source href={source.url} key={source.id} title={source.title} />
          ))}
        </Sources>
      )}

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
