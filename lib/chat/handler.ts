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
    if (isChatDisabled(env)) return errorResponse('disabled')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('invalid')
    }

    try {
      const kb = loadKnowledgeBase()
      const validation = validateChatRequest({
        body,
        kbTokenEstimate: kb.tokenEstimate,
        env,
      })
      if (!validation.ok) {
        return Response.json(validation.body, { status: validation.status })
      }

      const started = now()
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
        temperature: CHAT_TEMPERATURE,
        // Gemini 3.x still spends some thought tokens with reasoning off, and
        // they come out of this same budget. The health route needed 1,024 for
        // a single word, so confirm on a preview that real answers are not
        // truncated before trusting this number.
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
      })

      return createUIMessageStreamResponse({
        stream: toUIMessageStream({
          stream: result.stream,
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

/**
 * Cached input tokens for this call, from whichever place the provider put
 * them. The AI SDK maps Gemini's `cachedContentTokenCount` onto
 * `usage.inputTokenDetails.cacheReadTokens`; the raw field is read as a
 * fallback so a provider change that drops the mapping shows up as a missing
 * cache hit in the log rather than as a silent zero.
 */
export function cachedInputTokens(
  usage: Pick<LanguageModelUsage, 'inputTokenDetails'> | undefined,
  providerMetadata: ProviderMetadata | undefined
): number {
  const mapped = usage?.inputTokenDetails?.cacheReadTokens
  if (typeof mapped === 'number') return mapped

  const raw = providerMetadata?.google as
    { usageMetadata?: { cachedContentTokenCount?: number | null } } | undefined
  return raw?.usageMetadata?.cachedContentTokenCount ?? 0
}

interface CompletionAggregates {
  usage: LanguageModelUsage
  finishReason: string
  providerMetadata: ProviderMetadata | undefined
  ms: number
}

/** Numbers only. Never the question, never the answer, never an id. */
function logCompletion({
  usage,
  finishReason,
  providerMetadata,
  ms,
}: CompletionAggregates): void {
  const cached = cachedInputTokens(usage, providerMetadata)
  console.info('[chat]', {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
    cachedInputTokens: cached,
    cacheHit: cached > 0,
    finishReason,
    ms,
  })
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
