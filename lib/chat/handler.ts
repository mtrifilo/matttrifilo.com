import {
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type InferUIMessageChunk,
  type InferUITools,
  type LanguageModel,
  type LanguageModelUsage,
  type Tool,
  type UIMessage,
} from 'ai'
import { failureStage } from '@/lib/ai/failure-stage'
import {
  createVertexCallCounter,
  type BoundedFetchRetry,
} from '@/lib/ai/bounded-fetch'
import type { EnvSource } from '@/lib/env'
import {
  KNOWLEDGE_INDEX_TOKEN_CEILING,
  KNOWLEDGE_READ_BUDGET,
  type KnowledgeDocument,
  type KnowledgeEntry,
  type KnowledgeIndex,
} from '@/lib/knowledge'
import {
  PROGRESS_PART_ID,
  PROGRESS_PART_TYPE,
  type ChatDataParts,
  type ChatProgress,
  type ChatProgressPhase,
  type ChatProgressStep,
} from './progress'
import { READ_DOCUMENT_TOOL_NAME, buildMessages } from './prompt'
import { createReadDocumentSession, type ReadsRefused } from './read-document'
import {
  CHAT_ERROR_STATUS,
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_MAX_STEPS,
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
 * with a 30k prompt cap and a 20k read budget spread over CHAT_MAX_STEPS = 4
 * steps, the worst case is roughly 30k + 37k + 43k + 50k ≈ 160k input tokens
 * for one question. Vertex's implicit cache covers the stable prefix and
 * should take a large bite out of what is billed, but the ceiling is real and
 * it is why MTC-34's rate limit is not optional.
 *
 * Privacy rule for this whole module: no message text is ever written
 * anywhere. Not to the log, not into an error response, not into a header.
 * Only counts, flags, and durations leave the request.
 */

/**
 * What one request asks of the model it is handed.
 *
 * `onVertexRetry` is how the hidden retries reach this request's own log
 * line: the fetch wrapper under the Vertex client may open a second
 * connection for a stalled model call, and that second generation is billed
 * and spends the request's seconds while being invisible to the visitor and,
 * without this, to the `ms` on the completion line.
 *
 * `onVertexFirstByte` carries the other number that wrapper knows and nothing
 * else does: how long a model call waited before Vertex said anything. The
 * deadlines that decide whether a call is stalled or merely slow are guesses
 * at it, and `msSinceStart` on the step line cannot stand in — that is
 * elapsed time to the end of a step, generation included.
 */
export interface ChatModelRequest {
  onVertexRetry: (retry: BoundedFetchRetry) => void
  onVertexFirstByte: (ms: number) => void
}

export interface ChatHandlerDeps {
  loadKnowledgeIndex: () => KnowledgeIndex
  readKnowledgeDocument: (id: string) => KnowledgeDocument | undefined
  /**
   * A factory, not a model. Building the Vertex client reads required env, so
   * it must not run at import time — a missing variable would otherwise break
   * the build rather than one request — and the client is per request because
   * the retry sink above is.
   */
  model: (request: ChatModelRequest) => LanguageModel
  /**
   * Classifies the request as a person or automation before the body is
   * read (MTC-34). In production this is Vercel BotID's `checkBotId`;
   * tests inject a verdict. Required rather than defaulted so a deployment
   * cannot forget it and serve the model to anything that can POST.
   */
  verifyVisitor: () => Promise<VisitorVerdict>
  env?: EnvSource
  /** Injected so the duration in the log is assertable. */
  now?: () => number
}

/** The part of BotID's classification the route acts on and logs. */
export interface VisitorVerdict {
  /**
   * Typed boolean, but it arrives from a third-party JSON payload: an error
   * body from the classifier leaves it undefined. The route treats anything
   * but an explicit `false` as a bot.
   */
  isBot: boolean
  /** A crawler on Vercel's verified list. Still refused: this is a POST. */
  isVerifiedBot: boolean
  /**
   * Two sources. In local development BotID does not run and reports a
   * bypass; in production the flag is whatever the classifier said. The
   * route serves either, and logs the production case at warn level, since
   * a production bypass is a request served without a classification.
   */
  bypassed: boolean
}

// Defined with the limits it feeds; re-exported so callers of the handler
// keep one import.
export { CHAT_MAX_STEPS }

/**
 * Metadata the server attaches to the streamed message.
 *
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
  truncated?: true
  incomplete?: true
}

/** The one tool the model is offered. */
type ChatTools = Record<typeof READ_DOCUMENT_TOOL_NAME, Tool>

/**
 * The message the browser receives: the answer text, the progress narration,
 * and the metadata above.
 *
 * The SDK would also stream a `tool-output-available` part per read, carrying
 * the document's whole text, up to KNOWLEDGE_READ_BUDGET.maxTokens of it,
 * down to the browser. `onlyClientChunks` passes only the answer text, the
 * progress parts, the stream framing and the finish metadata; everything else
 * stays server-side. The document bytes would be a second copy of what the
 * answer already summarises, and a channel through which a corpus that later
 * stops being wholly public would leak without anyone editing this route.
 */
export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  ChatDataParts,
  InferUITools<ChatTools>
>

/** One chunk of the stream this route writes, as the SDK types it. */
type ChatUIChunk = InferUIMessageChunk<ChatUIMessage>

export function createChatHandler(deps: ChatHandlerDeps) {
  const {
    loadKnowledgeIndex,
    readKnowledgeDocument,
    model,
    verifyVisitor,
    env = process.env,
    now = Date.now,
  } = deps

  return async function handleChat(request: Request): Promise<Response> {
    // Before anything else, including reading the body: a disabled deployment
    // should do no work at all.
    if (isChatDisabled(env)) return rejectionResponse('disabled')

    // Then the visitor, still before the body. This is a network call to
    // the classifier, not a header check, and it is the one place a
    // third-party payload crosses into the route, so it is validated rather
    // than trusted: only an explicit "not a bot" passes. Verified crawlers
    // are refused too; nothing they are allowed to do involves POSTing a
    // question. A classifier that errors or stalls fails closed with the
    // same envelope as a model outage: refusing real visitors for a minute
    // costs less than serving every bot for as long as it is down. The
    // verdict is the one piece of per-request metadata logged beyond
    // counts, and only as flags.
    let visitor: VisitorVerdict
    try {
      visitor = await verifyVisitor()
    } catch (error) {
      logFailure(error, { stage: 'visitor', vertexRetries: 0 })
      return errorResponse('unavailable')
    }
    // Typed as an object, but it crosses from a third-party payload: a
    // null or primitive here must refuse, not throw, so the type-redundant
    // checks stay.
    if (
      typeof visitor !== 'object' ||
      visitor === null ||
      visitor.isBot !== false ||
      visitor.isVerifiedBot === true
    ) {
      return rejectionResponse('blocked', {
        verifiedBot: visitor?.isVerifiedBot === true,
      })
    }
    if (visitor.bypassed === true) {
      console.warn('[chat]', {
        botIdBypassed: true,
        env: env.VERCEL_ENV ?? 'unknown',
      })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return rejectionResponse('invalid')
    }

    const started = now()
    let stepCount = 0
    // Per request, like the read session below: the count belongs to the
    // request that paid for the retries.
    const vertexCalls = createVertexCallCounter()
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
        model: model({
          onVertexRetry: vertexCalls.observeRetry,
          onVertexFirstByte: vertexCalls.observeFirstByte,
        }),
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
        // empty bubble under a list of the documents it opened, which is
        // worse than nothing because it looks like an answer that said
        // nothing.
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
        // One numeric line per model call, so a slow request shows which
        // step (a read, or the final answer) the time went to. A preview
        // run took two minutes for two reads and a short answer with no
        // sign of where; this is the instrument that answers that.
        onStepEnd(step) {
          stepCount += 1
          console.info('[chat] step', {
            step: stepCount,
            msSinceStart: now() - started,
            inputTokens: step.usage.inputTokens ?? 0,
            outputTokens: step.usage.outputTokens ?? 0,
            reasoningTokens:
              step.usage.outputTokenDetails?.reasoningTokens ?? 0,
            toolCalls: step.toolCalls.length,
            finishReason: step.finishReason,
          })
        },
        onEnd({ usage, finishReason }) {
          logCompletion({
            usage,
            finishReason,
            answered: answer.answered(),
            documentsRead: session.documentsRead(),
            readTokens: session.readTokens(),
            readsRefused: session.readsRefused(),
            vertexRetries: vertexCalls.retries(),
            vertexFirstByteMs: vertexCalls.firstByteMs(),
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
            ...flatRefusals(session.readsRefused()),
            vertexRetries: vertexCalls.retries(),
            vertexFirstByteMs: vertexCalls.firstByteMs(),
            ms: now() - started,
          })
        },
      })

      return createUIMessageStreamResponse({
        stream: toUIMessageStream<ChatTools, ChatUIMessage>({
          stream: result.stream,
          // T3's rule: reasoning never mutates the answer. The SDK defaults
          // sendReasoning to true, which would put thought summaries on the
          // wire; the allowlist below would still drop them, but the default
          // is the wrong one to rely on.
          sendReasoning: false,
          sendSources: false,
          messageMetadata: ({ part }) => {
            answer.observe(part)
            if (part.type !== 'finish') return undefined

            const metadata: ChatMessageMetadata = {}
            // Lets the transcript show "this answer was cut short" instead of
            // leaving a half sentence looking like a finished answer.
            if (part.finishReason === 'length') metadata.truncated = true
            // No text, or any finish that is not a clean stop, means the run
            // did not end with a finished answer, most often a model that
            // spent every step reading. Say so.
            if (!answer.answered() || part.finishReason !== 'stop') {
              metadata.incomplete = true
            }
            return Object.keys(metadata).length > 0 ? metadata : undefined
          },
          // Masks the provider's text, which can quote the prompt back. The
          // response is already a 200 by now, so the refusal envelope goes
          // down the stream as text: the client reads the same shape it
          // reads from a 4xx/5xx body, and shows the same fixed copy.
          onError(error) {
            logFailure(error, { vertexRetries: vertexCalls.retries() })
            return JSON.stringify(chatErrorBody('interrupted'))
          },
        })
          .pipeThrough(withProgress({ entries: index.entries, now, started }))
          .pipeThrough(onlyAnswerText())
          .pipeThrough(onlyClientChunks()),
      })
    } catch (error) {
      // Anything thrown before the stream exists: missing env, a refused token
      // exchange, an unknown model.
      logFailure(error, { vertexRetries: vertexCalls.retries() })
      return errorResponse('unavailable')
    }
  }
}

/**
 * Whether the run produced an answer for the visitor to read.
 *
 * No text is kept, only the flag. The flag resets on every `start-step`, so
 * only the final step is judged: a model may narrate before a tool call
 * ("Let me check his résumé."), and that preamble is not the answer.
 */
class AnswerText {
  private sawText = false

  observe(part: { type: string; text?: string }): void {
    if (part.type === 'start-step') {
      this.sawText = false
      return
    }
    if (part.type !== 'text-delta' || typeof part.text !== 'string') return
    this.sawText ||= part.text.trim().length > 0
  }

  /** Whether the final step produced any text for the visitor to read. */
  answered(): boolean {
    return this.sawText
  }
}

// Only these chunk types reach the browser: the answer text, the stream
// framing, the metadata carried on `finish`, and this route's own progress
// narration (MTC-42), which is written by `withProgress` a few lines below
// out of the server's own index and never out of model output. An allowlist,
// not a denylist: a future chunk type that carries model-visible content
// (reasoning, tool output, source parts) stays server-side by default, and
// the tool chunks that carry whole documents stay filtered.
const CLIENT_CHUNK_TYPES: ReadonlySet<string> = new Set([
  'start',
  'start-step',
  'finish-step',
  'finish',
  'text-start',
  'text-delta',
  'text-end',
  'error',
  PROGRESS_PART_TYPE,
])

/**
 * Keeps only the UI chunks in CLIENT_CHUNK_TYPES.
 *
 * The SDK would otherwise stream a `read_document` input part and an output
 * part per read, the latter carrying the document's whole text. The browser
 * has no use for it: the answer is the content and the progress part names
 * what was read. Filtering the UI chunks rather than the model stream keeps this
 * a pure output concern: the tool loop, the read ledger, and the metadata
 * callback still see everything.
 */
function onlyClientChunks<T extends { type: string }>(): TransformStream<T, T> {
  return new TransformStream({
    transform(chunk, controller) {
      if (CLIENT_CHUNK_TYPES.has(chunk.type)) controller.enqueue(chunk)
    },
  })
}

/**
 * Holds text from a step until that step is known to be the answer, and
 * drops it when the step called a tool (MTC-49).
 *
 * Models routinely narrate before a read ("Let me check his résumé."). That
 * prose is `text-delta`, the same chunk type as the answer, so an allowlist
 * that forwards every text chunk puts chain-of-thought in the bubble. T3
 * Code never lets a non-`assistant_text` delta mutate the message; this is
 * the same gate for a one-tool loop: text from a tool-calling step is
 * scratchpad, text from a step that only wrote is the answer.
 *
 * Held until `finish-step` so a live token cannot race a tool call that
 * arrives later in the same step. The answer therefore appears when that
 * step ends rather than token-by-token; the progress view already covers
 * the wait. An abort or error mid-answer flushes what was held so a
 * partial briefing is not thrown away.
 */
function onlyAnswerText(): TransformStream<ChatUIChunk, ChatUIChunk> {
  let held: ChatUIChunk[] = []
  let dropText = false

  function flushHeld(
    controller: TransformStreamDefaultController<ChatUIChunk>
  ): void {
    if (dropText) {
      held = []
      return
    }
    for (const part of held) controller.enqueue(part)
    held = []
  }

  return new TransformStream({
    transform(chunk, controller) {
      if (chunk.type === 'start-step') {
        flushHeld(controller)
        dropText = false
        controller.enqueue(chunk)
        return
      }
      if (chunk.type.startsWith('tool-')) {
        dropText = true
        held = []
        controller.enqueue(chunk)
        return
      }
      if (
        chunk.type === 'text-start' ||
        chunk.type === 'text-delta' ||
        chunk.type === 'text-end'
      ) {
        if (!dropText) held.push(chunk)
        return
      }
      if (chunk.type.startsWith('reasoning')) return
      if (chunk.type === 'finish-step' || chunk.type === 'error') {
        flushHeld(controller)
        controller.enqueue(chunk)
        return
      }
      controller.enqueue(chunk)
    },
    flush(controller) {
      flushHeld(controller)
    },
  })
}

/**
 * Narrates the run to the browser as one data part that it rewrites in place
 * (MTC-42).
 *
 * The visitor waits ten to twenty seconds for the first token, because the
 * model reads one to three documents before it writes a word. This is where
 * that wait gets a voice: a step per read, then "writing", then how long the
 * whole thing took.
 *
 * Three properties are the whole design.
 *
 * It is an observer. Every chunk it sees is forwarded unchanged; nothing the
 * SDK produced is dropped or rewritten here. Filtering is `onlyClientChunks`'
 * job, one stage further down the pipe, which is why this one sees the tool
 * chunks the browser never will.
 *
 * Titles come from the index, never from the model. `tool-input-available`
 * carries an id the model chose, and that id is looked up in the same
 * `entries` the read tool validates against. An id that is not there yields
 * no step at all: the read is about to be refused as `unknown_document`, and
 * a step for a document that was never opened is the one thing this view must
 * not show.
 *
 * Silence is how a stopped run is reported. `done` is emitted once, just
 * before the stream's finish chunk, and only if the visitor was already
 * watching a progress part and nothing failed. Any other ending, whether an
 * error chunk, a cancelled request, or a connection that simply stops, emits
 * nothing more, so the last part the browser holds says `reading` or
 * `writing` forever. The client reads that absence as "stopped": no spinner, no running
 * timer, no claim about documents read. Saying nothing is the only ending
 * that cannot lie, and an error chunk is the case worth spelling out: the SDK
 * still writes a finish chunk after one, so `done` has to be withheld
 * deliberately rather than by never arriving.
 */
function withProgress({
  entries,
  now,
  started,
}: {
  entries: readonly KnowledgeEntry[]
  now: () => number
  started: number
}): TransformStream<ChatUIChunk, ChatUIChunk> {
  const titles = new Map(entries.map(entry => [entry.id, entry.title]))
  const steps: ChatProgressStep[] = []
  const listed = new Set<string>()
  /** Reads the session will have accepted, duplicates included, as it counts. */
  let reads = 0
  let phase: ChatProgressPhase = 'reading'
  let emitted = false
  let failed = false

  function emit(
    controller: TransformStreamDefaultController<ChatUIChunk>,
    ms?: number
  ): void {
    const data: ChatProgress = { steps: [...steps], phase }
    if (ms !== undefined) data.ms = ms
    // The same id every time. The SDK replaces a data part's payload in place
    // when type and id match an existing part, so this is one growing part
    // rather than a part per step, which matters because the client replays
    // the whole message back on the next question.
    controller.enqueue({
      type: PROGRESS_PART_TYPE,
      id: PROGRESS_PART_ID,
      data,
    })
    emitted = true
  }

  return new TransformStream({
    transform(chunk, controller) {
      switch (chunk.type) {
        case 'tool-input-available': {
          const step = toStep(chunk, titles, reads)
          if (!step) break
          // Spent whether or not it earns a row: the read session charges a
          // repeat to the budget the same as any other read.
          reads += 1
          if (listed.has(step.id)) break
          listed.add(step.id)
          steps.push(step)
          phase = 'reading'
          emit(controller)
          break
        }
        case 'text-start': {
          // A run that answers without reading anything needs no progress
          // part: there are no steps to narrate, and an empty one would only
          // put a spinner where the answer is already arriving. A model that
          // narrates before a tool call hits this first, too, and is ignored
          // for the same reason.
          if ((emitted || steps.length > 0) && phase !== 'writing') {
            phase = 'writing'
            emit(controller)
          }
          break
        }
        case 'error': {
          // A model that fails mid-run still reaches the finish chunk below,
          // so the failure has to be remembered here: without this flag an
          // interrupted answer would be stamped `done` and summarised as a
          // finished read of N documents.
          failed = true
          break
        }
        case 'finish': {
          // Before the finish chunk, so the browser has the final state in
          // hand by the time the stream closes.
          if (emitted && !failed) {
            phase = 'done'
            emit(controller, now() - started)
          }
          break
        }
      }
      controller.enqueue(chunk)
    },
  })
}

/**
 * The step a `read_document` call earns, if it earns one.
 *
 * Everything is guarded rather than asserted: this reads a chunk built from
 * model output, and a malformed one has to yield no step instead of throwing
 * inside a transform, where it would take the answer down with it.
 *
 * The document cap is predicted here rather than waited for, so the list
 * never counts a read that cannot happen: past
 * KNOWLEDGE_READ_BUDGET.maxDocuments the read session refuses on count
 * alone, before it looks at the id at all.
 *
 * The token half of that budget is not predicted, because it depends on
 * document text this stage has not seen. A read the session refused for size
 * would therefore both earn a row it did not deserve and spend one of the
 * three this counter allows, hiding a later read that did happen. Tests in
 * lib/knowledge/knowledge.test.ts keep that unreachable: one holds every
 * document under KNOWLEDGE_DOCUMENT_TOKEN_CEILING, well under the whole-turn
 * budget, and 'the three largest documents fit in one turn' holds both the
 * three largest together and the worst repeated read inside it. They are
 * load-bearing for a claim this view makes on screen, which is why they are
 * named here rather than left to be found.
 */
function toStep(
  chunk: { toolName?: unknown; input?: unknown },
  titles: ReadonlyMap<string, string>,
  reads: number
): ChatProgressStep | undefined {
  if (chunk.toolName !== READ_DOCUMENT_TOOL_NAME) return undefined
  if (reads >= KNOWLEDGE_READ_BUDGET.maxDocuments) return undefined
  const input = chunk.input
  if (typeof input !== 'object' || input === null) return undefined
  const id = (input as { id?: unknown }).id
  if (typeof id !== 'string') return undefined
  const title = titles.get(id)
  return title === undefined ? undefined : { id, title }
}

/** The refusal counters as the same three flat fields on every log path. */
function flatRefusals(r: {
  unknown: number
  budget: number
  tooLarge: number
}) {
  return {
    readsRefusedUnknown: r.unknown,
    readsRefusedBudget: r.budget,
    readsRefusedTooLarge: r.tooLarge,
  }
}

function errorResponse(
  code: 'disabled' | 'blocked' | 'invalid' | 'unavailable'
): Response {
  return Response.json(chatErrorBody(code), { status: CHAT_ERROR_STATUS[code] })
}

/** A refusal the handler decides on its own, logged like any other. */
function rejectionResponse(
  code: 'disabled' | 'blocked' | 'invalid',
  flags: Record<string, boolean> = {}
): Response {
  logRejection(code, flags)
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
  /** Connections the Vertex wrapper abandoned and reopened on this request. */
  vertexRetries: number
  /** The slowest wait for a first response byte on this request. */
  vertexFirstByteMs: number
  ms: number
}

/**
 * Numbers only. Never the question, never the answer, never a document id.
 *
 * Document ids are not secret, and the corpus lives in a public repository,
 * but leaving them out keeps this line a fixed set of numeric fields that a
 * log query can aggregate without ever growing a text column that someone
 * later fills with something that is secret.
 */
function logCompletion({
  usage,
  finishReason,
  answered,
  documentsRead,
  readTokens,
  readsRefused,
  vertexRetries,
  vertexFirstByteMs,
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
    ...flatRefusals(readsRefused),
    // False here is the signal that a request burned tokens and gave the
    // visitor nothing. It should be rare; if it is not, CHAT_MAX_STEPS is
    // wrong.
    answered,
    finishReason,
    aborted: false,
    // Zero on a healthy request. Anything above it means a model call stalled
    // and was reopened, so this request's `ms` — and its bill — contain a
    // generation the visitor never saw: abandoning a connection does not
    // cancel the generation behind it.
    vertexRetries,
    // What VERTEX_FIRST_BYTE_TIMEOUT_MS and VERTEX_LAST_ATTEMPT_TIMEOUT_MS
    // are hypotheses about: the longest a model call on this request waited
    // before Vertex sent a byte. A run of these from preview is what decides
    // whether either bound sits in the right place.
    vertexFirstByteMs,
    ms,
  }
  // An answer that stopped on length was cut off mid-word, and any other
  // non-'stop' finish means no usable answer at all. Both get their
  // own marker rather than hiding among the ordinary completions.
  if (finishReason === 'length') console.warn('[chat] truncated', aggregate)
  else if (finishReason !== 'stop') console.warn('[chat] incomplete', aggregate)
  else console.info('[chat]', aggregate)
}

/** Makes refused requests visible in the logs, by code and flags only. */
function logRejection(code: string, flags: Record<string, boolean> = {}): void {
  console.info('[chat]', { rejected: code, ...flags })
}

/**
 * Failures are logged as a stage and an error name only. A provider error
 * message can contain the prompt, and the prompt contains the visitor's
 * question, which this route promises never to record.
 */
function logFailure(
  error: unknown,
  { stage, vertexRetries }: { stage?: 'visitor'; vertexRetries: number }
): void {
  console.error('[chat]', {
    // failureStage classifies the Vertex chain; a visitor-classifier failure
    // names its own stage so an operator is not sent to the wrong system.
    stage: stage ?? failureStage(error),
    error: error instanceof Error ? error.name : typeof error,
    // On the failure path above all others: a request that exhausted the
    // wrapper's attempts reached Vertex more than once and was billed for
    // every one of them, and a line carrying only a stage and an error name
    // says a stalled-and-retried failure and a first-try failure cost the
    // same.
    vertexRetries,
  })
}
