'use client'

import { ArrowUp, Square } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { CHAT_MAX_MESSAGE_CHARS } from '@/lib/chat/answer'
import { cn } from '@/lib/utils'
import { ASSISTANT_PLACEHOLDER } from './copy'

/**
 * The one way to ask a question: a textarea that grows with what is typed and
 * a button that sends it, or stops the answer that is already arriving
 * (MTC-33).
 *
 * This is a plain textarea rather than AI Elements' `prompt-input`. That
 * component is built around file attachments, screen capture, a model picker
 * and a command palette — none of which this assistant has, all of which would
 * ship to every visitor of the homepage. What is left after removing them is
 * the hundred lines below.
 *
 * The question limit is enforced here as well as on the route, because the
 * route's refusal arrives after the question has left the box: by then it is
 * in the transcript and out of the visitor's hands. A counter appears as the
 * limit nears, and the send button will not send past it.
 */

export interface AssistantComposerProps {
  value: string
  onValueChange: (value: string) => void
  /** Called with the trimmed question. Never called empty or over the limit. */
  onSubmit: (question: string) => void
  /** Present only where an answer can be interrupted. */
  onStop?: () => void
  /** Swaps the send button for a stop button. */
  streaming?: boolean
  /** Lets the page keep the caret here after a send or a starter question. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  className?: string
}

/** The counter shows once a question is this close to the limit. */
const COUNTER_THRESHOLD = Math.floor(CHAT_MAX_MESSAGE_CHARS * 0.8)

const OVER_LIMIT_HINT = 'trim the question to send it'

export function AssistantComposer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  streaming = false,
  textareaRef,
  className,
}: AssistantComposerProps) {
  const fallbackRef = useRef<HTMLTextAreaElement | null>(null)
  const ref = textareaRef ?? fallbackRef
  const counterId = useId()
  // An IME composing a character sends Enter to commit it. Sending the message
  // there would post a half-written word and eat the keystroke that finished
  // it, so Enter only sends once composition has ended.
  const [composing, setComposing] = useState(false)

  useAutoGrow(ref, value)

  // Measured on what would be sent: the route sees the trimmed question.
  const question = value.trim()
  const overLimit = question.length > CHAT_MAX_MESSAGE_CHARS
  const showCounter = question.length >= COUNTER_THRESHOLD

  const submit = useCallback(() => {
    if (question.length === 0 || overLimit || streaming) return
    onSubmit(question)
  }, [onSubmit, overLimit, question, streaming])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      submit()
    },
    [submit]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) return
      if (composing || event.nativeEvent.isComposing) return
      event.preventDefault()
      submit()
    },
    [composing, submit]
  )

  const canSend = question.length > 0 && !overLimit

  return (
    <form
      className={cn(
        'rounded-xl border border-border bg-card py-3 pl-4 pr-3',
        'transition-colors focus-within:border-ring',
        overLimit && 'border-destructive focus-within:border-destructive',
        className
      )}
      onSubmit={handleSubmit}
    >
      <div className="flex items-end gap-3">
        <textarea
          aria-describedby={showCounter ? counterId : undefined}
          aria-invalid={overLimit || undefined}
          aria-label="Ask a question about Matt's work"
          className={cn(
            // min-h-9 matches the send button; py-2 + leading-5 puts the
            // first line in the vertical centre of that 36px row. items-end
            // on the flex keeps the button on the last line once the box
            // grows.
            'max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-base',
            'leading-5 outline-none placeholder:text-muted-foreground'
          )}
          onChange={event => onValueChange(event.target.value)}
          onCompositionEnd={() => setComposing(false)}
          onCompositionStart={() => setComposing(true)}
          onKeyDown={handleKeyDown}
          placeholder={ASSISTANT_PLACEHOLDER}
          ref={ref}
          rows={1}
          value={value}
        />
        {streaming && onStop ? (
          <button
            aria-label="Stop generating"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70"
            onClick={onStop}
            type="button"
          >
            <Square aria-hidden="true" className="size-4 fill-current" />
          </button>
        ) : (
          <button
            aria-label="Send question"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full',
              'bg-primary text-primary-foreground transition-opacity',
              'disabled:opacity-40'
            )}
            disabled={!canSend}
            type="submit"
          >
            <ArrowUp aria-hidden="true" className="size-4.5" />
          </button>
        )}
      </div>
      {showCounter && (
        <p
          className={cn(
            'mt-1 text-right text-xs tabular-nums',
            overLimit ? 'text-destructive' : 'text-muted-foreground'
          )}
          id={counterId}
        >
          {question.length.toLocaleString('en-US')} /{' '}
          {CHAT_MAX_MESSAGE_CHARS.toLocaleString('en-US')}
          {overLimit && `: ${OVER_LIMIT_HINT}`}
        </p>
      )}
      {/* The counter itself is not live: it would be read on every
          keystroke. Only crossing the limit is announced; emptying a polite
          region says nothing, so coming back under it is silent. */}
      <span aria-live="polite" className="sr-only">
        {overLimit ? OVER_LIMIT_HINT : ''}
      </span>
    </form>
  )
}

/**
 * Grow the textarea to fit its content, up to the max height the class sets.
 *
 * Done in JavaScript rather than with `field-sizing-content` because that
 * property is still Chromium-only; on Firefox and Safari the input would stay
 * one line tall however long the question got.
 */
function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string
): void {
  useEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    // Collapse first: scrollHeight only shrinks once the element is smaller
    // than its content, so measuring without this makes the box one-way.
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [ref, value])
}
