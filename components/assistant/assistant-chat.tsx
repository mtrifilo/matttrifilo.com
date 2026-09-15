'use client'

import { useChat } from '@ai-sdk/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import {
  Suggestion,
  Suggestions,
} from '@/components/ai-elements/suggestion'
import {
  announcementFor,
  joinTextParts,
  toAnswerView,
  toChatErrorView,
} from '@/lib/chat/answer'
import type { ChatUIMessage } from '@/lib/chat/handler'
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

  const { messages, sendMessage, status, stop, error, regenerate, clearError } =
    useChat<ChatUIMessage>()

  const busy = status === 'submitted' || status === 'streaming'
  const errorView = toChatErrorView(error)

  const ask = useCallback(
    (question: string) => {
      clearError()
      setInput('')
      void sendMessage({ text: question })
      // The next question is usually a follow-up, and a starter question that
      // moved focus to a pill would leave the visitor tabbing back.
      textareaRef.current?.focus()
    },
    [clearError, sendMessage]
  )

  // The homepage panel hands its question over through sessionStorage; asking
  // it here is what makes submitting from the homepage feel like one action.
  // The ref, not the storage read, is what keeps it to one send: React runs
  // effects twice in development.
  const handedOff = useRef(false)
  useEffect(() => {
    if (handedOff.current) return
    handedOff.current = true
    const pending = takePendingQuestion()
    if (pending) void sendMessage({ text: pending })
  }, [sendMessage])

  const lastIsQuestion = messages.at(-1)?.role === 'user'
  const announcement = announcementFor(
    status,
    messages.some(message => message.role === 'assistant')
  )

  return (
    <div className="mx-auto flex h-[calc(100svh-var(--nav-height))] w-full max-w-3xl flex-col gap-6 px-4 pt-8 pb-6 md:px-8">
      <AssistantHeader />

      <p aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </p>

      {messages.length === 0 ? (
        <EmptyState onPick={ask} />
      ) : (
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
                          ? { onRegenerate: () => void regenerate() }
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
      )}

      <div className="space-y-2">
        {errorView && <ChatErrorNotice error={errorView} />}
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
      <h1
        className="font-semibold"
        style={{ fontSize: 'clamp(1.5rem, 3vw + 0.25rem, 2rem)' }}
      >
        {ASSISTANT_NAME}
      </h1>
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
