import { geminiModel, getVertex } from '@/lib/ai/vertex'
import { createChatHandler } from '@/lib/chat/handler'
import type { KnowledgeDocument } from '@/lib/knowledge'
import { loadKnowledgeIndex, readKnowledgeDocument } from '@/lib/knowledge'
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

/** One prior exchange, as a suite writes it in YAML. */
interface HistoryTurn {
  role: 'user' | 'assistant'
  text: string
}

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
 * plus the rare id refused afterwards for exhausting the token budget. It can
 * therefore be a superset of what the answer saw by at most one document, and
 * every assertion built on it is written as a subset test for that reason.
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
    const readIds: string[] = []
    const model = geminiModel()

    const handler = createChatHandler({
      loadKnowledgeIndex,
      readKnowledgeDocument: (id: string): KnowledgeDocument | undefined => {
        const document = readKnowledgeDocument(id)
        if (document) readIds.push(document.id)
        return document
      },
      model: () => getVertex()(model),
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

    const response = await handler(
      chatRequest(prompt, historyFrom(context.vars))
    )
    const body = await response.text()

    // A refusal before the stream exists is a JSON envelope, not SSE. Report
    // its code rather than letting the suite assert against an empty answer.
    if (!response.ok) {
      return failure(
        `CHAT_ERROR: ${envelopeCode(body)}`,
        baseMetadata(readIds, model, response.status)
      )
    }

    const answer = parseUiMessageStream(body)
    const metadata: EvalMetadata = {
      ...baseMetadata(readIds, model, response.status),
      sourceIds: (answer.metadata.sources ?? []).map(source => source.id),
      finishReason: answer.finishReason,
      ...flags(answer.metadata),
    }

    // The route writes its envelope into the stream's error text when the
    // model fails after the response has already been committed as a 200.
    if (answer.errorText !== undefined) {
      return failure(`CHAT_ERROR: ${envelopeCode(answer.errorText)}`, metadata)
    }

    return { output: answer.text, metadata }
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

/** The body the AI SDK client posts: one text part per message. */
function chatRequest(question: string, history: HistoryTurn[]): Request {
  const messages = [...history, { role: 'user' as const, text: question }].map(
    (turn, index) => ({
      id: `${turn.role}-${index}`,
      role: turn.role,
      parts: [{ type: 'text', text: turn.text }],
    })
  )
  return new Request('https://matttrifilo.com/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
}

/**
 * Prior turns for the multi-turn suites, from the test's `history` var.
 *
 * They travel in the body exactly as a browser would send them, which is the
 * point: the policy treats a replayed assistant turn as unverified visitor
 * text, and the escalation tests exist to prove it.
 */
function historyFrom(vars: Record<string, unknown> | undefined): HistoryTurn[] {
  const history = vars?.history
  if (!Array.isArray(history)) return []
  const turns: HistoryTurn[] = []
  for (const entry of history) {
    if (typeof entry !== 'object' || entry === null) continue
    const { role, text } = entry as { role?: unknown; text?: unknown }
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof text !== 'string') continue
    turns.push({ role, text })
  }
  return turns
}

/** The `code` out of a chat error envelope, or the raw body if it is not one. */
function envelopeCode(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed === 'object' && parsed !== null) {
      const error = (parsed as { error?: unknown }).error
      if (typeof error === 'object' && error !== null) {
        const code = (error as { code?: unknown }).code
        if (typeof code === 'string') return code
      }
    }
  } catch {
    // Not JSON: fall through to the raw body below.
  }
  return body.slice(0, 200)
}
