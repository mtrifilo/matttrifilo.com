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
import {
  createReadDocumentSession,
  type ChatSource,
  type ReadsRefused,
} from './read-document'
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
 * needs, and only then does it answer. `stopWhen` bounds that loop,
 * `prepareStep` forces the last step to write the answer, and
 * KNOWLEDGE_READ_BUDGET bounds what may be read.
 *
 * Bounded is not cheap. Every step re-sends the whole conversation so far,
 * tool results included, so the input tokens add up rather than staying flat:
 * with a 16k prompt cap and a 20k read budget spread over CHAT_MAX_STEPS = 4
 * steps, the worst case is roughly 16k + 23k + 29k + 36k ≈ 104k input tokens
 * for one question. Vertex's implicit cache covers the stable prefix and
 * should take a large bite out of what is billed, but the ceiling is real and
 * it is why MTC-34's rate limit is not optional.
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
 *
 * `+ 1` and not `+ 2` because `prepareStep` now spends the last step on the
 * answer rather than hoping the model volunteers one. That makes a wasted
 * call — a hallucinated id, say — cost a document rather than the answer: the
 * visitor gets a reply drawn from fewer sources instead of an empty bubble.
 * Raising it to `+ 2` would buy one retry back at about a quarter more input
 * tokens per request; the cost note above is the reason it is not free.
 */
export const CHAT_MAX_STEPS = KNOWLEDGE_READ_BUDGET.maxDocuments + 1

/**
 * Metadata the server attaches to the streamed message, for MTC-33.
 *
 * - `sources`: the documents this request actually read, named by the server,
 *   in read order. Authoritative, and what the chips should render. The
 *   `Sources:` line the policy asks the model to write is a secondary signal —
 *   a model can forget it or cite an id it never opened, so it must not drive
 *   the chips. Absent when there is nothing to cite, on a decline, and when
 *   the run produced no answer text at all; a truncated answer keeps them.
 * - `truncated`: text arrived but stopped mid-sentence on the output cap. The
 *   answer is partial and still worth showing under a "cut short" notice.
 * - `incomplete`: the run ended without a clean answer — no text at all, or a
 *   finish reason other than 'stop'. Show a "couldn't finish, try again"
 *   notice. `truncated` implies this, so a UI that handles only `incomplete`
 *   still degrades correctly.
 *
 * Both flags are present-or-absent rather than booleans, so `metadata.x` is
 * never a falsy `false` the UI has to distinguish from "not set".
 */
export interface ChatMessageMetadata {
  sources?: ChatSource[]
  truncated?: true
  incomplete?: true
}

/** The one tool the model is offered. */
type ChatTools = Record<typeof READ_DOCUMENT_TOOL_NAME, Tool>

/**
 * The message MTC-33 receives: answer text and the metadata above, and
 * nothing else.
 *
 * The SDK would also stream a `tool-output-available` part per read, carrying
 * the document's whole text — up to KNOWLEDGE_READ_BUDGET.maxTokens of it —
 * down to the browser. `withoutToolParts` strips every `tool-*` chunk before
 * the response is built. The UI needs the `sources` metadata, not the bytes,
 * so sending them would be bandwidth spent on a second copy of what the
 * answer already summarises, and a channel through which a corpus that later
 * stops being wholly public would leak without anyone editing this route.
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
        // The last step has to produce the answer, so it is not offered the
        // tool. Without this a model that spends every step reading ends the
        // run on 'tool-calls' with no text at all, and the visitor gets an
        // empty bubble — with source chips under it, which is worse than
        // nothing because it looks like an answer that said nothing.
        prepareStep: ({ stepNumber }) =>
          stepNumber === CHAT_MAX_STEPS - 1
            ? { toolChoice: 'none' }
            : undefined,
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
            answered: answer.answered(),
            documentsRead: session.documentsRead(),
            readTokens: session.readTokens(),
            readsRefused: session.readsRefused(),
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
            answered: answer.answered(),
            documentsRead: session.documentsRead(),
            readTokens: session.readTokens(),
            readsRefused: session.readsRefused(),
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
            // No text, or any finish that is not a clean stop, means the run
            // did not end with a finished answer — most often a model that
            // spent every step reading. Say so. A length-truncated answer is
            // still real text that was drawn from the documents read, so it
            // keeps its chips; only a run with no answer at all withholds
            // them, since citations under a blank reply claim it was sourced
            // when it was never written.
            if (!answer.answered() || part.finishReason !== 'stop') {
              metadata.incomplete = true
            }

            const sources = session.sources()
            // A decline is the one answer that may be written without
            // reading. It can still follow reads that turned out not to
            // answer the question, and chips under "I can't answer that"
            // would claim the opposite, so they are dropped.
            if (
              sources.length > 0 &&
              !answer.isDecline() &&
              answer.answered()
            ) {
              metadata.sources = sources
            }
            return Object.keys(metadata).length > 0 ? metadata : undefined
          },
          // Masks the provider's text, which can quote the prompt back.
          onError(error) {
            logFailure(error)
            return STREAM_ERROR_MESSAGE
          },
        }).pipeThrough(withoutToolParts()),
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
 * Just enough of the answer to tell whether it is the decline sentence, and
 * whether there was an answer at all.
 *
 * Only the opening characters are kept. The question this has to answer is
 * "did the model decline", and holding a whole answer to decide it would mean
 * this module carrying visitor-visible text further than it needs to.
 *
 * The buffer resets on every `start-step`, so only the final step's text is
 * judged. A model may narrate before a tool call ("Let me check his
 * résumé.") and that preamble is not the answer: left in, it would fill the
 * buffer and make a decline written two steps later look like prose, or the
 * reverse.
 */
class AnswerText {
  /** The sentence plus room for whatever whitespace precedes it. */
  private static readonly KEEP = DECLINE_SENTENCE.length + 16
  private opening = ''
  private sawText = false

  observe(part: { type: string; text?: string }): void {
    if (part.type === 'start-step') {
      this.opening = ''
      this.sawText = false
      return
    }
    if (part.type !== 'text-delta' || typeof part.text !== 'string') return
    this.sawText ||= part.text.length > 0
    if (this.opening.length >= AnswerText.KEEP) return
    this.opening += part.text
  }

  /** Whether the final step produced any text for the visitor to read. */
  answered(): boolean {
    return this.sawText
  }

  isDecline(): boolean {
    return this.opening.trimStart().startsWith(DECLINE_SENTENCE)
  }
}

/**
 * Strips every `tool-*` chunk from the UI stream.
 *
 * The SDK streams a `read_document` input part and an output part per read,
 * and the output part carries the document's whole text. The browser has no
 * use for it — the answer is the content, and `sources` names where it came
 * from — so it is dropped here rather than shipped and ignored. Filtering the
 * UI chunks rather than the model stream keeps it a pure output concern: the
 * tool loop, the read ledger, and the metadata above all still see everything.
 */
function withoutToolParts<T extends { type: string }>(): TransformStream<T, T> {
  return new TransformStream({
    transform(chunk, controller) {
      if (!chunk.type.startsWith('tool-')) controller.enqueue(chunk)
    },
  })
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
  answered: boolean
  documentsRead: number
  readTokens: number
  readsRefused: ReadsRefused
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
  answered,
  documentsRead,
  readTokens,
  readsRefused,
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
    // Split by reason: unknown ids mean the model is guessing at the index,
    // budget refusals mean the caps are too tight for real questions, and
    // tooLarge means a document in the corpus can never be read at all. They
    // call for three different fixes, so they are three different counters.
    readsRefusedUnknown: readsRefused.unknown,
    readsRefusedBudget: readsRefused.budget,
    readsRefusedTooLarge: readsRefused.tooLarge,
    // False here is the signal that a request burned tokens and gave the
    // visitor nothing. It should be rare; if it is not, CHAT_MAX_STEPS is
    // wrong.
    answered,
    finishReason,
    aborted: false,
    ms,
  }
  // An answer that stopped on length lost its Sources trailer mid-word, and
  // any other non-'stop' finish means no usable answer at all. Both get their
  // own marker rather than hiding among the ordinary completions.
  if (finishReason === 'length') console.warn('[chat] truncated', aggregate)
  else if (finishReason !== 'stop') console.warn('[chat] incomplete', aggregate)
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
