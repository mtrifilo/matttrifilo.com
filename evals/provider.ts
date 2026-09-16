import { geminiModel, getVertex, usesVercelFederation } from '@/lib/ai/vertex'
import { createChatHandler } from '@/lib/chat/handler'
import type { KnowledgeDocument } from '@/lib/knowledge'
import { loadKnowledgeIndex, readKnowledgeDocument } from '@/lib/knowledge'
import {
  chatRequest,
  envelopeCode,
  historyFrom,
  isTransportCode,
} from './route-request'
import { parseUiMessageStream, type StreamedMetadata } from './route-stream'

/**
 * The promptfoo target: the chat route's own code path, in process (MTC-32).
 *
 * There is no server. Each test builds the `Request` the browser would post
 * and hands it to a handler built from `createChatHandler` with the real
 * knowledge module and the real Vertex client, so a suite exercises the
 * policy, the read budget, the step cap, the client-chunk allowlist, and the
 * metadata the UI renders from, not a copy of them. The two dependencies that
 * cannot be real here are the visitor classifier, which needs Vercel, and the
 * clock.
 *
 * `readKnowledgeDocument` is wrapped rather than passed through, because
 * which documents a run opened is the ground truth the groundedness suite
 * compares the answer's citations against, and nothing on the stream carries
 * it: the handler filters tool chunks out before the response leaves.
 *
 * The response is read through the stream's public shape only, so a new part
 * added to the stream elsewhere does not change what a suite sees.
 */

interface ProviderOptions {
  id?: string
  config?: Record<string, unknown>
}

interface CallContext {
  vars?: Record<string, unknown>
}

interface ProviderResponse {
  output: string
  error?: string
  metadata?: Record<string, unknown>
}

/**
 * Metadata every test can assert on.
 *
 * `readIds` is the ledger described above. It records the ids the handler
 * resolved from the store, which is every id the model was given text for,
 * plus any refused afterwards for being too large or for exhausting the token
 * budget: read-document.ts consults the store before it applies either check.
 * It is therefore a superset of what the answer saw, bounded by the step cap
 * rather than by the read budget, and every assertion built on it is written
 * as a subset test for that reason.

 * `finishReason` is carried for the person reading a red row, not for an
 * assertion. `incomplete` and `truncated` are what assertAnswered judges.
 */
export interface EvalMetadata extends Record<string, unknown> {
  readIds: string[]
  /** The server's authoritative source list, absent on a decline. */
  sourceIds: string[]
  finishReason?: string
  truncated?: true
  incomplete?: true
  /** The model the route was pointed at, for the run summary. */
  model: string
  status: number
  /** 1, or 2 when the first attempt was lost to a transport stall. */
  attempt?: number
}

export default class ChatRouteProvider {
  private readonly providerId: string

  constructor(options: ProviderOptions = {}) {
    this.providerId = options.id ?? 'chat-route'
  }

  id(): string {
    return this.providerId
  }

  async callApi(
    prompt: string,
    context: CallContext = {}
  ): Promise<ProviderResponse> {
    // Asked before the handler is built, because a credential problem inside
    // it is logged as an error NAME only, by the route's privacy policy, and
    // reaches a suite as 102 identical `unavailable` rows that say nothing
    // about the cause. The commonest way in is a shell that still has some of
    // the GCP_* federation variables exported from the one-time gcloud setup.
    usesVercelFederation()

    const history = historyFrom(context.vars)
    const first = await this.ask(chatRequest(prompt, history), 1)
    // A stalled connection is not an answer, so it is not evidence about the
    // policy either, and a suite that reddens on one is measuring Vertex's
    // latency rather than the assistant. One extra attempt, only for the two
    // transport codes: a real outage still reddens the run on the second try,
    // and the worst case stays bounded at two requests per test.
    if (!first.transportFailure) return first.response
    const second = await this.ask(chatRequest(prompt, history), 2)
    return second.response
  }

  /** One request through the route's handler, read back off the stream. */
  private async ask(
    request: Request,
    attempt: 1 | 2
  ): Promise<{ response: ProviderResponse; transportFailure: boolean }> {
    const readIds: string[] = []
    const model = geminiModel()

    const handler = createChatHandler({
      loadKnowledgeIndex,
      readKnowledgeDocument: (id: string): KnowledgeDocument | undefined => {
        const document = readKnowledgeDocument(id)
        if (document) readIds.push(document.id)
        return document
      },
      // The counters are forwarded rather than dropped so the route's own
      // `[chat]` completion line carries real vertexRetries and
      // vertexFirstByteMs for an eval run. Those two numbers are what MTC-38's
      // timeout constants are hypotheses about, and a full suite is the
      // largest sample of them anything here produces.
      model: modelRequest =>
        getVertex({
          onRetry: modelRequest.onVertexRetry,
          onFirstByte: modelRequest.onVertexFirstByte,
        })(model),
      // BotID needs a Vercel deployment and a browser challenge, neither of
      // which exists here. Every suite is about what the model does with a
      // question that has already been let through, so the classifier is
      // answered with the verdict a local development request gets.
      verifyVisitor: () =>
        Promise.resolve({
          isBot: false,
          isVerifiedBot: false,
          bypassed: true,
        }),
      env: process.env,
    })

    const response = await handler(request)
    const body = await response.text()

    // A refusal before the stream exists is a JSON envelope, not SSE. Report
    // its code rather than letting the suite assert against an empty answer.
    if (!response.ok) {
      const code = envelopeCode(body)
      return {
        response: failure(`CHAT_ERROR: ${code}`, {
          ...baseMetadata(readIds, model, response.status),
          attempt,
        }),
        transportFailure: attempt === 1 && isTransportCode(code),
      }
    }

    const answer = parseUiMessageStream(body)
    const metadata: EvalMetadata = {
      ...baseMetadata(readIds, model, response.status),
      attempt,
      sourceIds: (answer.metadata.sources ?? []).map(source => source.id),
      finishReason: answer.finishReason,
      ...flags(answer.metadata),
    }

    // The route writes its envelope into the stream's error text when the
    // model fails after the response has already been committed as a 200.
    if (answer.errorText !== undefined) {
      const code = envelopeCode(answer.errorText)
      return {
        response: failure(`CHAT_ERROR: ${code}`, metadata),
        transportFailure: attempt === 1 && isTransportCode(code),
      }
    }

    return {
      response: { output: answer.text, metadata },
      transportFailure: false,
    }
  }
}

/**
 * Reported as a promptfoo error rather than an empty answer.
 *
 * A run that never reached the model has not told us anything about the
 * policy, and an assertion like "does not contain a salary" would pass on the
 * empty string. An error result cannot be mistaken for a pass, and the run
 * summary counts it against the suite.
 */
function failure(
  message: string,
  metadata: Record<string, unknown>
): ProviderResponse {
  return { output: message, error: message, metadata }
}

function baseMetadata(
  readIds: string[],
  model: string,
  status: number
): EvalMetadata {
  return { readIds, sourceIds: [], model, status }
}

function flags(metadata: StreamedMetadata) {
  return {
    ...(metadata.truncated ? { truncated: true as const } : {}),
    ...(metadata.incomplete ? { incomplete: true as const } : {}),
  }
}
