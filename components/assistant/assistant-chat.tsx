'use client'

import { useChat } from '@ai-sdk/react'
import { RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import {
  announcementFor,
  discardsQuestion,
  joinTextParts,
  toAnswerView,
  toChatErrorView,
} from '@/lib/chat/answer'
import type { ChatUIMessage } from '@/lib/chat/handler'
import { cn } from '@/lib/utils'
import { AnswerShimmer } from './answer-shimmer'
import { AssistantAnswer } from './assistant-answer'
import { AssistantComposer } from './assistant-composer'
import { AssistantDisclosure } from './assistant-disclosure'
import { AssistantHeader } from './assistant-header'
import { ChatErrorNotice } from './assistant-notice'
import {
  ASK_STARTER_QUESTIONS,
  ASSISTANT_INTRO,
  ASSISTANT_NAME,
  RESET_LABEL,
} from './copy'
import { takePendingQuestion } from './pending-question'

/**
 * The conversation at /ask (MTC-33).
 *
 * Everything it holds lives in this tab: `useChat` keeps the transcript in
 * React state, the route writes nothing down, and a reload is a new
 * conversation. That is the promise the disclosure makes, and it is kept by
 * there being nowhere for a conversation to go.
 *
 * Screen-reader behaviour is the one thing here worth reading twice. The
 * transcript is NOT a live region: with `aria-live` on it, every streamed
 * token would re-announce the whole growing answer. The visually hidden
 * `role="status"` below announces three states instead — working, done,
 * failed — and the reader can then move into the transcript at their own pace.
 */
export function AssistantChat() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // The question just sent, until the route has answered or refused it. It is
  // what stops the rollback in `onError` from touching a question that was
  // answered and then failed on a regenerate.
  const askedRef = useRef<string | null>(null)

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    error,
    regenerate,
    clearError,
  } = useChat<ChatUIMessage>({
    // A refused question comes back out of the transcript and into the box.
    // `useChat` adds the question before the request and keeps it after a
    // failure, so without this the same refused body is posted on every
    // later send and the conversation is stuck. `setMessages` is bound by
    // the time this runs: the SDK calls it well after the hook returns.
    onError: failure => {
      const question = askedRef.current
      askedRef.current = null
      if (question === null) return
      const view = toChatErrorView(failure)
      if (!view || !discardsQuestion(view.code)) return
      setMessages(current =>
        current.at(-1)?.role === 'user' ? current.slice(0, -1) : current
      )
      setInput(current => (current.length > 0 ? current : question))
    },
  })

  const busy = status === 'submitted' || status === 'streaming'
  const errorView = useMemo(() => toChatErrorView(error), [error])
  const hasTranscript = messages.length > 0

  const ask = useCallback(
    (question: string) => {
      clearError()
      setInput('')
      askedRef.current = question
      void sendMessage({ text: question })
      // The next question is usually a follow-up, and a starter question that
      // moved focus to a pill would leave the visitor tabbing back.
      textareaRef.current?.focus()
    },
    [clearError, sendMessage]
  )

  const reset = useCallback(() => {
    stop()
    clearError()
    setMessages([])
    setInput('')
    askedRef.current = null
    textareaRef.current?.focus()
  }, [clearError, setMessages, stop])

  const handleRegenerate = useCallback(() => {
    askedRef.current = null
    void regenerate()
  }, [regenerate])

  // The homepage panel hands its question over through sessionStorage; asking
  // it here is what makes submitting from the homepage feel like one action.
  // The ref, not the storage read, is what keeps it to one send: React runs
  // effects twice in development.
  const handedOff = useRef(false)
  useEffect(() => {
    if (handedOff.current) return
    handedOff.current = true
    const pending = takePendingQuestion()
    if (pending) {
      askedRef.current = pending
      void sendMessage({ text: pending })
    }
  }, [sendMessage])

  const lastIsQuestion = messages.at(-1)?.role === 'user'
  const announcement = announcementFor(
    status,
    messages.some(message => message.role === 'assistant')
  )

  return (
    <div className="mx-auto flex h-[calc(100svh-var(--nav-height))] w-full max-w-3xl flex-col gap-6 px-4 pt-8 pb-6 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <AssistantHeader />
        {hasTranscript && (
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={reset}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {RESET_LABEL}
          </button>
        )}
      </div>

      {/* The page keeps its heading once the conversation starts; it only
          stops taking up room. */}
      <h1
        className={cn('font-semibold', hasTranscript && 'sr-only')}
        style={{ fontSize: 'clamp(1.5rem, 3vw + 0.25rem, 2rem)' }}
      >
        {ASSISTANT_NAME}
      </h1>

      <p aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </p>

      {hasTranscript ? (
        <Conversation className="min-h-0">
          <ConversationContent className="pb-2">
            {messages.map((message, index) => {
              const isLast = index === messages.length - 1
              if (message.role === 'user') {
                return (
                  <Message from="user" key={message.id}>
                    <MessageContent>
                      {joinTextParts(message.parts)}
                    </MessageContent>
                  </Message>
                )
              }
              return (
                <Message from="assistant" key={message.id}>
                  <MessageContent>
                    <AssistantAnswer
                      actions={
                        isLast && status === 'ready'
                          ? { onRegenerate: handleRegenerate }
                          : undefined
                      }
                      pending={isLast && busy}
                      view={toAnswerView(message)}
                    />
                  </MessageContent>
                </Message>
              )
            })}

            {/* Between sending and the stream opening there is no assistant
                message to hang the wait on, so it gets a row of its own. */}
            {busy && lastIsQuestion && (
              <Message from="assistant">
                <MessageContent>
                  <AnswerShimmer />
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      ) : (
        <EmptyState onPick={ask} />
      )}

      <div className="space-y-2">
        {errorView && <ChatErrorNotice error={errorView} onReset={reset} />}
        <AssistantComposer
          onStop={stop}
          onSubmit={ask}
          onValueChange={setInput}
          streaming={busy}
          textareaRef={textareaRef}
          value={input}
        />
        <AssistantDisclosure />
      </div>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 pb-8">
      <p className="max-w-xl leading-relaxed text-muted-foreground">
        {ASSISTANT_INTRO}
      </p>
      <Suggestions>
        {ASK_STARTER_QUESTIONS.map(question => (
          <Suggestion key={question} onClick={onPick} suggestion={question} />
        ))}
      </Suggestions>
    </div>
  )
}
