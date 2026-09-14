import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type LanguageModelUsage,
  type ProviderMetadata,
} from 'ai'
import { failureStage } from '@/lib/ai/failure-stage'
import type { EnvSource } from '@/lib/env'
import type { KnowledgeBase } from '@/lib/knowledge'
import { buildMessages } from './prompt'
import {
  CHAT_ERROR_STATUS,
  CHAT_MAX_INPUT_TOKENS,
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_TEMPERATURE,
  chatErrorBody,
  isChatDisabled,
  validateChatRequest,
} from './validate'

/**
 * The chat route's behaviour, with its two impure edges injected (MTC-31).
 *
 * `app/api/chat/route.ts` is a thin wiring file over this so the knowledge
 * base and the Vertex model can be swapped for test doubles, and so the route
 * module itself exports nothing but a handler (Next's route type check
 * rejects anything else).
 *
 * Privacy rule for this whole module: no message text is ever written
 * anywhere. Not to the log, not into an error response, not into a header.
 * Only counts, flags, and durations leave the request.
 */

export interface ChatHandlerDeps {
  loadKnowledgeBase: () => KnowledgeBase
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

export function createChatHandler(deps: ChatHandlerDeps) {
  const { loadKnowledgeBase, model, env = process.env, now = Date.now } = deps

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
      const kb = loadKnowledgeBase()
      // A corpus this large leaves no room for a conversation, so every
      // request would fail the budget check below and blame the visitor for a
      // deployment fault. MTC-29 caps the corpus at build time; this is the
      // serving-side backstop, and it is our problem, not theirs.
      if (kb.tokenEstimate >= CHAT_MAX_INPUT_TOKENS) {
        console.error('[chat]', {
          stage: 'config',
          error: 'knowledge-base-over-input-budget',
        })
        return errorResponse('unavailable')
      }

      const validation = validateChatRequest({
        body,
        kbTokenEstimate: kb.tokenEstimate,
        env,
      })
      if (!validation.ok) {
        logRejection(validation.body.error.code)
        return Response.json(validation.body, { status: validation.status })
      }

      const result = streamText({
        model: model(),
        messages: buildMessages({
          kb,
          history: validation.history,
          userMessage: validation.userMessage,
        }),
        // buildMessages puts the policy and the knowledge base at the front as
        // system messages; the Google provider folds them into the single
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
        onEnd({ usage, finishReason, finalStep }) {
          logCompletion({
            usage,
            finishReason,
            providerMetadata: finalStep.providerMetadata,
            ms: now() - started,
          })
        },
        onAbort({ steps }) {
          logCompletion({
            usage: sumUsage(steps),
            finishReason: 'abort',
            providerMetadata: steps.at(-1)?.providerMetadata,
            ms: now() - started,
            aborted: true,
          })
        },
      })

      return createUIMessageStreamResponse({
        stream: toUIMessageStream({
          stream: result.stream,
          // Lets MTC-33 show "this answer was cut short" instead of leaving a
          // half sentence and a missing Sources line looking like an answer.
          messageMetadata: ({ part }) =>
            part.type === 'finish' && part.finishReason === 'length'
              ? { truncated: true }
              : undefined,
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

function errorResponse(code: 'disabled' | 'invalid' | 'unavailable'): Response {
  return Response.json(chatErrorBody(code), { status: CHAT_ERROR_STATUS[code] })
}

/** A refusal the handler decides on its own, logged like any other. */
function rejectionResponse(code: 'disabled' | 'invalid'): Response {
  logRejection(code)
  return errorResponse(code)
}

/** Raw Gemini usage, as the provider nests it under its metadata key. */
interface GoogleUsageMetadata {
  usageMetadata?: { cachedContentTokenCount?: number | null }
}

/**
 * Cached input tokens for this call.
 *
 * `usage.inputTokenDetails.cacheReadTokens` is the normal source and is
 * already populated from Gemini's `cachedContentTokenCount`. The raw metadata
 * is only a fallback for a usage object that never arrived — an aborted run,
 * say. Note the metadata key: a Vertex-backed model has provider id
 * `google.vertex.chat`, and the SDK keys its metadata `googleVertex` and
 * `vertex` for those, never `google`. `google` is kept last so the same
 * function still works if this ever runs against the direct Gemini API.
 */
export function cachedInputTokens(
  usage: Pick<LanguageModelUsage, 'inputTokenDetails'> | undefined,
  providerMetadata: ProviderMetadata | undefined
): number {
  const mapped = usage?.inputTokenDetails?.cacheReadTokens
  if (typeof mapped === 'number') return mapped

  const raw = (providerMetadata?.googleVertex ??
    providerMetadata?.vertex ??
    providerMetadata?.google) as GoogleUsageMetadata | undefined
  return raw?.usageMetadata?.cachedContentTokenCount ?? 0
}

/**
 * Combined usage across whatever steps completed before an abort. A visitor
 * who closes the tab mid-answer has still been billed for the tokens spent so
 * far, so they are worth the same log line as a completed request.
 */
function sumUsage(
  steps: readonly { usage: LanguageModelUsage }[]
): LanguageModelUsage {
  const total = steps.reduce(
    (sum, step) => ({
      input: sum.input + (step.usage.inputTokens ?? 0),
      output: sum.output + (step.usage.outputTokens ?? 0),
      reasoning:
        sum.reasoning + (step.usage.outputTokenDetails?.reasoningTokens ?? 0),
      cacheRead:
        sum.cacheRead + (step.usage.inputTokenDetails?.cacheReadTokens ?? 0),
    }),
    { input: 0, output: 0, reasoning: 0, cacheRead: 0 }
  )
  return {
    inputTokens: total.input,
    inputTokenDetails: {
      noCacheTokens: total.input - total.cacheRead,
      cacheReadTokens: total.cacheRead,
      cacheWriteTokens: undefined,
    },
    outputTokens: total.output,
    outputTokenDetails: {
      textTokens: total.output - total.reasoning,
      reasoningTokens: total.reasoning,
    },
    totalTokens: total.input + total.output,
  }
}

interface CompletionAggregates {
  usage: LanguageModelUsage
  finishReason: string
  providerMetadata: ProviderMetadata | undefined
  ms: number
  aborted?: boolean
}

/** Numbers only. Never the question, never the answer, never a section id. */
function logCompletion({
  usage,
  finishReason,
  providerMetadata,
  ms,
  aborted = false,
}: CompletionAggregates): void {
  const cached = cachedInputTokens(usage, providerMetadata)
  const aggregate = {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
    cachedInputTokens: cached,
    cacheHit: cached > 0,
    finishReason,
    aborted,
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
