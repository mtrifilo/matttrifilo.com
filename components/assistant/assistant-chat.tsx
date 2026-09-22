'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import {
  announcementFor,
  discardsQuestion,
  joinTextParts,
  showsFollowUps,
  toAnswerView,
  toChatErrorView,
  type AnswerView,
} from '@/lib/chat/answer'
import type { ChatUIMessage } from '@/lib/chat/handler'
import { STOPPED_BEFORE_FIRST_STEP } from '@/lib/chat/progress'
import { createChatFetch } from '@/lib/chat/transport'
import { AssistantAnswer } from './assistant-answer'
import { AssistantComposer } from './assistant-composer'
import { AssistantDisclosure } from './assistant-disclosure'
import { AssistantEmptyState } from './assistant-empty-state'
import { AssistantHeader } from './assistant-header'
import { ChatErrorNotice } from './assistant-notice'
import { AssistantProgress } from './assistant-progress'
import { ASSISTANT_NAME, RESET_LABEL } from './copy'
import { takePendingQuestion } from './pending-question'
import { useElapsed } from './use-elapsed'

// One transport for the page's life. `fetch` is looked up at call time so
// the module can be evaluated before the browser globals exist.
const transport = new DefaultChatTransport<ChatUIMessage>({
  api: '/api/chat',
  fetch: createChatFetch((input, init) => fetch(input, init)),
})

/**
 * The question has been sent and no assistant message exists yet, so there is
 * nothing to derive a view from. The progress component reads this as
 * "thinking" and shows the spinner and the timer (MTC-42).
 */
const EMPTY_VIEW: AnswerView = {
  text: '',
  followUps: [],
  truncated: false,
  incomplete: false,
}

/** The same row once the visitor has stopped a run that never got going. */
const STOPPED_VIEW: AnswerView = {
  ...EMPTY_VIEW,
  progress: STOPPED_BEFORE_FIRST_STEP,
}

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
 * `role="status"` below announces the run's state instead: which document is
 * being read, that the answer is being written, that it is done, that it
 * failed (MTC-42). The reader can then move into the transcript at their own
 * pace. The elapsed timer is never in that announcement: it changes every
 * second, and a region that re-reads every second says nothing at all.
 */
export function AssistantChat() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // True when the visitor stopped the most recent run. The SDK reports an
  // abort as an ordinary `ready` with no error and no metadata, so nothing
  // else on the page can tell that ending from a finished answer: a run that
  // read nothing has no progress part to read it from either.
  //
  // It also carries the case where the stop landed before the server had
  // said anything at all. The SDK creates the assistant message on the first
  // chunk that carries content, so until then there is no message to mark,
  // and the placeholder row has to stay behind and say so itself.
  const [stopped, setStopped] = useState(false)

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
    transport,
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
      // A draft typed while the request was out is kept too, after it.
      setInput(current =>
        current.length > 0 ? `${question}\n\n${current}` : question
      )
    },
  })

  const busy = status === 'submitted' || status === 'streaming'
  const errorView = useMemo(() => toChatErrorView(error), [error])
  const hasTranscript = messages.length > 0
  // One clock for the page, started the moment a question is sent rather than
  // when the stream opens, so the timer counts the wait the visitor is
  // actually sitting through. It freezes wherever the run ended.
  const elapsedMs = useElapsed(busy)

  const ask = useCallback(
    (question: string) => {
      clearError()
      // Only the text being sent leaves the box. A starter pill tapped with
      // a refused question sitting there (handed back by onError) must not
      // discard it.
      setInput(current => (current.trim() === question ? '' : current))
      setStopped(false)
      askedRef.current = question
      void sendMessage({ text: question })
      // The next question is usually a follow-up, and a starter question that
      // moved focus to a pill would leave the visitor tabbing back.
      textareaRef.current?.focus()
    },
    [clearError, sendMessage]
  )

  // Empties the transcript, not the composer: what is typed there is the
  // next question (or the refused one, just handed back), and "new
  // conversation" is where it is about to be asked.
  const reset = useCallback(() => {
    stop()
    clearError()
    setMessages([])
    setStopped(false)
    askedRef.current = null
    textareaRef.current?.focus()
  }, [clearError, setMessages, stop])

  const handleRegenerate = useCallback(() => {
    askedRef.current = null
    setStopped(false)
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

  const lastMessage = messages.at(-1)
  const lastIsQuestion = lastMessage?.role === 'user'
  // The run in flight, for the announcement only. A screen reader hears the
  // steps as they change instead of one flat "Responding" for twenty seconds.
  const lastProgress = useMemo(
    () =>
      lastMessage && lastMessage.role === 'assistant'
        ? toAnswerView(lastMessage).progress
        : undefined,
    [lastMessage]
  )
  const announcement = announcementFor(
    status,
    messages.some(message => message.role === 'assistant'),
    stopped && lastIsQuestion ? STOPPED_BEFORE_FIRST_STEP : lastProgress,
    stopped
  )

  const stopRun = useCallback(() => {
    setStopped(true)
    stop()
  }, [stop])

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
          stops taking up room. The empty state renders the visible one, as
          part of its centred group. */}
      {hasTranscript && <h1 className="sr-only">{ASSISTANT_NAME}</h1>}

      <p aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </p>

      {/* Before the first question the group is centred in the column, and
          the composer below is part of it. Two flexible spaces do that,
          rather than a wrapper around both, because the composer keeps its
          caret and its draft only while it keeps its place in this tree. */}
      {!hasTranscript && <div aria-hidden="true" className="flex-1" />}

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
              const view = toAnswerView(message)
              return (
                <Message from="assistant" key={message.id}>
                  <MessageContent>
                    <AssistantAnswer
                      actions={
                        isLast && status === 'ready'
                          ? { onRegenerate: handleRegenerate }
                          : undefined
                      }
                      // Only the last answer is the one this clock is timing.
                      // Earlier ones show the duration the server sent with
                      // them, which is on the message itself.
                      elapsedMs={isLast ? elapsedMs : 0}
                      onFollowUp={
                        showsFollowUps({
                          isLast,
                          ready: status === 'ready',
                          stopped,
                          view,
                        })
                          ? ask
                          : undefined
                      }
                      pending={isLast && busy}
                      view={view}
                    />
                  </MessageContent>
                </Message>
              )
            })}

            {/* Between sending and the stream opening there is no assistant
                message to hang the wait on, so it gets a row of its own. */}
            {(busy || stopped) && lastIsQuestion && (
              <Message from="assistant">
                <MessageContent>
                  <AssistantProgress
                    elapsedMs={elapsedMs}
                    pending={busy}
                    view={busy ? EMPTY_VIEW : STOPPED_VIEW}
                  />
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      ) : (
        <AssistantEmptyState onPick={ask} />
      )}

      <div className="space-y-2">
        {errorView && (
          <ChatErrorNotice
            error={errorView}
            onReset={hasTranscript ? reset : undefined}
          />
        )}
        <AssistantComposer
          onStop={stopRun}
          onSubmit={ask}
          onValueChange={setInput}
          streaming={busy}
          textareaRef={textareaRef}
          value={input}
        />
        <AssistantDisclosure />
      </div>

      {!hasTranscript && <div aria-hidden="true" className="flex-1" />}
    </div>
  )
}
