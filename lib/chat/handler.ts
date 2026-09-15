import {
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type InferUITools,
  type LanguageModel,
  type LanguageModelUsage,
  type Tool,
  type UIDataTypes,
  type UIMessage,
} from 'ai'
import { failureStage } from '@/lib/ai/failure-stage'
import type { EnvSource } from '@/lib/env'
import {
  KNOWLEDGE_INDEX_TOKEN_CEILING,
  KNOWLEDGE_READ_BUDGET,
  type KnowledgeDocument,
  type KnowledgeIndex,
} from '@/lib/knowledge'
import {
  DECLINE_SENTENCE,
  READ_DOCUMENT_TOOL_NAME,
  buildMessages,
} from './prompt'
import { createReadDocumentSession, type ChatSource } from './read-document'
import {
  CHAT_ERROR_STATUS,
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_TEMPERATURE,
  chatErrorBody,
  isChatDisabled,
  validateChatRequest,
} from './validate'

/**
 * The chat route's behaviour, with its impure edges injected (MTC-31).
 *
 * `app/api/chat/route.ts` is a thin wiring file over this so the knowledge
 * module and the Vertex model can be swapped for test doubles, and so the
 * route module itself exports nothing but a handler (Next's route type check
 * rejects anything else).
 *
 * The shape of one request: the policy and the document index go up as the
 * prompt, the model calls `read_document` for the documents it decides it
 * needs, and only then does it answer. `stopWhen` bounds that loop and
 * KNOWLEDGE_READ_BUDGET bounds what it may read; between them a request can
 * cost at most a fixed, known amount however the model behaves.
 *
 * Privacy rule for this whole module: no message text is ever written
 * anywhere. Not to the log, not into an error response, not into a header.
 * Only counts, flags, and durations leave the request.
 */

export interface ChatHandlerDeps {
  loadKnowledgeIndex: () => KnowledgeIndex
  readKnowledgeDocument: (id: string) => KnowledgeDocument | undefined
  /**
   * A thunk, not a model. Building the Vertex client reads required env, so
   * it must not run at import time — a missing variable would otherwise break
   * the build rather than one request.
   */
  model: () => LanguageModel
  env?: EnvSource
  /** Injected so the duration in the log is assertable. */
  now?: () => number
}

/** What the visitor sees if the model fails mid-stream. */
export const STREAM_ERROR_MESSAGE =
  'The assistant lost its connection part-way through that answer. Ask again, or email Matt at matt.trifilo@gmail.com.'

/**
 * Model calls allowed in one request: one per document the model may read,
 * plus the one that writes the answer.
 *
 * A step is a model call and the tool calls it emitted, so this is not the
 * same bound as the read budget — one step can ask for several documents.
 * Both caps are needed: this one stops a model that loops without ever
 * answering, KNOWLEDGE_READ_BUDGET stops one that reads the whole corpus in
 * a single step.
 */
export const CHAT_MAX_STEPS = KNOWLEDGE_READ_BUDGET.maxDocuments + 1

/**
 * Metadata the server attaches to the streamed message. MTC-33 renders
 * `sources` as chips and `truncated` as a "cut short" notice.
 *
 * `sources` is authoritative, and it is what the UI should render: it is the
 * set of documents this request actually read, named by the server, in read
 * order. The `Sources:` line the policy asks the model to write is a
 * secondary signal — useful inside the answer, but a model can forget it or
 * cite an id it never opened, so it must not drive the chips.
 */
export interface ChatMessageMetadata {
  sources?: ChatSource[]
  truncated?: true
}

/** The one tool the model is offered. */
type ChatTools = Record<typeof READ_DOCUMENT_TOOL_NAME, Tool>

/**
 * The message MTC-33 receives. Alongside the text it also carries the
 * `read_document` call and result parts the SDK streams for every tool step;
 * those are progress, not content, and the UI is free to ignore them.
 */
export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  UIDataTypes,
  InferUITools<ChatTools>
>

export function createChatHandler(deps: ChatHandlerDeps) {
  const {
    loadKnowledgeIndex,
    readKnowledgeDocument,
    model,
    env = process.env,
    now = Date.now,
  } = deps

  return async function handleChat(request: Request): Promise<Response> {
    // Before anything else, including reading the body: a disabled deployment
    // should do no work at all.
    if (isChatDisabled(env)) return rejectionResponse('disabled')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return rejectionResponse('invalid')
    }

    const started = now()
    try {
      const index = loadKnowledgeIndex()
      // An index over its own ceiling is a deployment fault: MTC-29 enforces
      // the ceiling at build time and this is the serving-side backstop. It
      // is refused here rather than left to the input budget below, which
      // would blame the visitor for it.
      if (index.tokenEstimate > KNOWLEDGE_INDEX_TOKEN_CEILING) {
        console.error('[chat]', {
          stage: 'config',
          error: 'knowledge-index-over-ceiling',
        })
        return errorResponse('unavailable')
      }

      const validation = validateChatRequest({
        body,
        indexTokenEstimate: index.tokenEstimate,
        env,
      })
      if (!validation.ok) {
        logRejection(validation.body.error.code)
        return Response.json(validation.body, { status: validation.status })
      }

      // Per request, because the read budget is per request: a session built
      // once at module scope would let one visitor's reads exhaust another's.
      const session = createReadDocumentSession({
        entries: index.entries,
        readKnowledgeDocument,
      })

      const answer = new AnswerText()

      const result = streamText({
        model: model(),
        messages: buildMessages({
          index,
          history: validation.history,
          userMessage: validation.userMessage,
        }),
        tools: { [READ_DOCUMENT_TOOL_NAME]: session.tool } satisfies ChatTools,
        // Reads, then one answer. Without a stop condition the SDK would run
        // a single step and never come back for the answer after a tool call.
        stopWhen: stepCountIs(CHAT_MAX_STEPS),
        // buildMessages puts the policy and the index at the front as system
        // messages; the Google provider folds them into the single
        // `systemInstruction` that Vertex's implicit cache keys on.
        allowSystemInMessages: true,
        // Cancels the upstream Vertex call when the visitor closes the tab,
        // and is what makes onAbort reachable at all: without a signal the SDK
        // never takes its abort path, so a disconnect would end the request
        // with no log line and a generation still being billed.
        abortSignal: request.signal,
        temperature: CHAT_TEMPERATURE,
        // 'none' does not disable thinking on Gemini 3.x. The provider clamps
        // it to the model's minimum thinking level — 'low' for
        // gemini-3.8-flash, 'minimal' below 3.7 — and those thought tokens
        // come out of maxOutputTokens. Changing GEMINI_MODEL changes that
        // floor and so the answer budget left over; the '[chat] truncated'
        // marker below is how a too-small budget shows up in the logs.
        reasoning: 'none',
        maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
        onEnd({ usage, finishReason }) {
          logCompletion({
            usage,
            finishReason,
            documentsRead: session.documentsRead(),
            readTokens: session.readTokens(),
            ms: now() - started,
          })
        },
        onAbort() {
          // No step has finished by the time a stream is cancelled, so no
          // usage exists to report: the SDK only records a step on
          // finish-step. Log the fact, the reads that did happen, and the
          // duration, nothing invented.
          console.info('[chat]', {
            finishReason: 'abort',
            aborted: true,
            documentsRead: session.documentsRead(),
            readTokens: session.readTokens(),
            ms: now() - started,
          })
        },
      })

      return createUIMessageStreamResponse({
        stream: toUIMessageStream<ChatTools, ChatUIMessage>({
          stream: result.stream,
          messageMetadata: ({ part }) => {
            answer.observe(part)
            if (part.type !== 'finish') return undefined

            const metadata: ChatMessageMetadata = {}
            // Lets MTC-33 show "this answer was cut short" instead of leaving
            // a half sentence and a missing Sources line looking like an
            // answer.
            if (part.finishReason === 'length') metadata.truncated = true
            const sources = session.sources()
            // A decline is the one answer that may be written without
            // reading. It can still follow reads that turned out not to
            // answer the question, and chips under "I can't answer that"
            // would claim the opposite, so they are dropped.
            if (sources.length > 0 && !answer.isDecline()) {
              metadata.sources = sources
            }
            return Object.keys(metadata).length > 0 ? metadata : undefined
          },
          // Masks the provider's text, which can quote the prompt back.
          onError(error) {
            logFailure(error)
            return STREAM_ERROR_MESSAGE
          },
        }),
      })
    } catch (error) {
      // Anything thrown before the stream exists: missing env, a refused token
      // exchange, an unknown model.
      logFailure(error)
      return errorResponse('unavailable')
    }
  }
}

/**
 * Just enough of the answer to tell whether it is the decline sentence.
 *
 * Only the opening characters are kept. The question this has to answer is
 * "did the model decline", and holding a whole answer to decide it would mean
 * this module carrying visitor-visible text further than it needs to.
 */
class AnswerText {
  /** The sentence plus room for whatever whitespace precedes it. */
  private static readonly KEEP = DECLINE_SENTENCE.length + 16
  private opening = ''

  observe(part: { type: string; text?: string }): void {
    if (part.type !== 'text-delta' || typeof part.text !== 'string') return
    if (this.opening.length >= AnswerText.KEEP) return
    this.opening += part.text
  }

  isDecline(): boolean {
    return this.opening.trimStart().startsWith(DECLINE_SENTENCE)
  }
}

function errorResponse(code: 'disabled' | 'invalid' | 'unavailable'): Response {
  return Response.json(chatErrorBody(code), { status: CHAT_ERROR_STATUS[code] })
}

/** A refusal the handler decides on its own, logged like any other. */
function rejectionResponse(code: 'disabled' | 'invalid'): Response {
  logRejection(code)
  return errorResponse(code)
}

/**
 * Cached input tokens for this call, from the AI SDK's usage mapping, which
 * the Google provider fills from Gemini's `cachedContentTokenCount`. A
 * missing mapping reads as zero; there is no second source worth consulting.
 */
export function cachedInputTokens(
  usage: Pick<LanguageModelUsage, 'inputTokenDetails'> | undefined
): number {
  return usage?.inputTokenDetails?.cacheReadTokens ?? 0
}

interface CompletionAggregates {
  usage: LanguageModelUsage
  finishReason: string
  documentsRead: number
  readTokens: number
  ms: number
}

/**
 * Numbers only. Never the question, never the answer, never a document id.
 *
 * Document ids are not secret — they are in the index and on the page as
 * source chips — but leaving them out keeps this line a fixed set of numeric
 * fields that a log query can aggregate without ever growing a text column
 * that someone later fills with something that is secret.
 */
function logCompletion({
  usage,
  finishReason,
  documentsRead,
  readTokens,
  ms,
}: CompletionAggregates): void {
  const cached = cachedInputTokens(usage)
  const aggregate = {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
    cachedInputTokens: cached,
    cacheHit: cached > 0,
    documentsRead,
    readTokens,
    finishReason,
    aborted: false,
    ms,
  }
  // An answer that stopped on length lost its Sources trailer mid-word, so it
  // gets its own marker rather than hiding among the ordinary completions.
  if (finishReason === 'length') console.warn('[chat] truncated', aggregate)
  else console.info('[chat]', aggregate)
}

/** Makes refused requests visible in the logs, by code and nothing else. */
function logRejection(code: string): void {
  console.info('[chat]', { rejected: code })
}

/**
 * Failures are logged as a stage and an error name only. A provider error
 * message can contain the prompt, and the prompt contains the visitor's
 * question, which this route promises never to record.
 */
function logFailure(error: unknown): void {
  console.error('[chat]', {
    stage: failureStage(error),
    error: error instanceof Error ? error.name : typeof error,
  })
}
