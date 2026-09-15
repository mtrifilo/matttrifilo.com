'use client'

import { ArrowUp, Square } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
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
 * the eighty lines below.
 */

export interface AssistantComposerProps {
  value: string
  onValueChange: (value: string) => void
  /** Called with the trimmed question. Never called with an empty string. */
  onSubmit: (question: string) => void
  /** Present only where an answer can be interrupted. */
  onStop?: () => void
  /** Swaps the send button for a stop button. */
  streaming?: boolean
  /** Lets the page keep the caret here after a send or a starter question. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  className?: string
}

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
  // An IME composing a character sends Enter to commit it. Sending the message
  // there would post a half-written word and eat the keystroke that finished
  // it, so Enter only sends once composition has ended.
  const [composing, setComposing] = useState(false)

  useAutoGrow(ref, value)

  const submit = useCallback(() => {
    const question = value.trim()
    if (question.length === 0 || streaming) return
    onSubmit(question)
  }, [onSubmit, streaming, value])

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

  const canSend = value.trim().length > 0

  return (
    <form
      className={cn(
        'flex items-end gap-3 rounded-xl border border-border bg-card py-3 pl-4 pr-3',
        'transition-colors focus-within:border-ring',
        className
      )}
      onSubmit={handleSubmit}
    >
      <textarea
        aria-label="Ask a question about Matt's work"
        className={cn(
          'max-h-40 min-h-[1.625rem] flex-1 resize-none bg-transparent text-base',
          'leading-relaxed outline-none placeholder:text-muted-foreground'
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
