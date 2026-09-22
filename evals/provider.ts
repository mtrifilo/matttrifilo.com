import { geminiModel, getVertex, usesVercelFederation } from '@/lib/ai/vertex'
import { createChatHandler } from '@/lib/chat/handler'
import {
  fetchRepositoryActivity,
  toActivityDigest,
} from '@/lib/chat/github-activity'
import type { KnowledgeDocument } from '@/lib/knowledge'
import { loadKnowledgeIndex, readKnowledgeDocument } from '@/lib/knowledge'
import {
  chatRequest,
  envelopeCode,
  historyFrom,
  isTransportCode,
} from './route-request'
import { isUncitedAnswer } from './assertions'
import {
  hasNothingToGrade,
  parseUiMessageStream,
  type StreamedMetadata,
} from './route-stream'

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
 * `fetchActivity` is wrapped for the same reason and in the same way, so a
 * suite can assert which repository a run checked on GitHub (MTC-45).
 *
 * The response is read through the stream's public shape only, so a new part
 * added to the stream elsewhere does not change what a suite sees.
 */

/** Requests per test when the first ones are lost to a transport stall. */
export const EVAL_TRANSPORT_ATTEMPTS = 3

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
 *
 * `activityRepos` is the same kind of ledger for `recent_activity`: the
 * repositories a run actually fetched from GitHub. Like `readIds` it records
 * what got past the allowlist, so an id the model invented never appears in
 * it, and a repository whose fetch then failed does. It is keyed by
 * repository rather than being a list of tool names, because which
 * repository was checked is the thing a golden needs to assert and a name
 * alone cannot carry it.
 *
 * `activityDates` is what makes an activity golden mean anything. Asserting
 * that the answer carries a recent-looking year does not: eleven corpus
 * documents mention the current year, so an answer written entirely from
 * documents passes. These are the dates GitHub returned, so an assertion can
 * ask whether the answer is talking about what GitHub said. Only successful
 * fetches contribute, which is why a GitHub outage reddens those two rows
 * rather than passing them quietly.
 *
 * It records what was fetched rather than what the model was handed: a digest
 * the session then refuses on the shared token budget still contributes here.
 * Narrow, since it needs budget exhaustion on an activity question, and the
 * assertion that reads this says so.

 * `finishReason` is carried for the person reading a red row, not for an
 * assertion. `incomplete` and `truncated` are what assertAnswered judges.
 */
export interface EvalMetadata extends Record<string, unknown> {
  readIds: string[]
  /** Repositories this run fetched activity for, in the order it asked. */
  activityRepos: string[]
  /** ISO dates carried by the digests this run was handed. */
  activityDates: string[]
  /** The server's authoritative source list, absent on a decline. */
  sourceIds: string[]
  /**
   * The follow-up questions the run proposed, as the browser would receive
   * them: already validated by the handler, empty on a decline (MTC-41).
   */
  followUps: string[]
  finishReason?: string
  truncated?: true
  incomplete?: true
  /** The model the route was pointed at, for the run summary. */
  model: string
  status: number
  /** 1, or higher when earlier attempts were lost to a transport stall. */
  attempt?: number
  /**
   * This row carries no answer to grade: any error envelope, or a 200 whose
   * stream held no text. Wider than the two transport codes the retry loop
   * acts on, because the question here is whether the row is evidence, not
   * whose fault it is: a route decision the suites never expect (the kill
   * switch, a rejected body) leaves as little to grade as a stalled
   * connection. Counted per run as `transportFailures` and refused by the
   * publish gate, because an assertion that checks for the ABSENCE of
   * something passes on an empty output and would publish as evidence.
   */
  transportFailure?: true
  /**
   * The answer used a document and wrote no `Sources:` trailer, as
   * `isUncitedAnswer` defines that. Recorded rather than only failed: the
   * count is what says how often the citation line goes missing, and the
   * publish gate refuses a run where it is more than a tenth of the tests.
   *
   * Never set together with `transportFailure`: a row with nothing to grade
   * has no answer to be missing a trailer from. It is set independently of
   * whether the test passed, though, so a row the trailer assertion still
   * fails (it read a document other than the one its test names) is counted
   * here and also costs the run a pass.
   */
  missingTrailer?: true
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
    // A stalled connection is not an answer, so it is not evidence about the
    // policy either, and a suite that reddens on one is measuring Vertex's
    // latency rather than the assistant. Extra attempts, only for the two
    // transport codes: a real outage still reddens the run on the last try,
    // and the worst case stays bounded. Two retries rather than one because
    // CI can 403 on impersonation for a few hundred milliseconds after the
    // identity binding is minted; warmup.ts should have absorbed that, and
    // these attempts are the remaining margin.
    for (let attempt = 1; attempt <= EVAL_TRANSPORT_ATTEMPTS; attempt++) {
      const result = await this.ask(chatRequest(prompt, history), attempt)
      if (!result.transportFailure) return result.response
    }
    throw new Error('EVAL_TRANSPORT_ATTEMPTS must be at least 1')
  }

  /** One request through the route's handler, read back off the stream. */
  private async ask(
    request: Request,
    attempt: number
  ): Promise<{ response: ProviderResponse; transportFailure: boolean }> {
    const readIds: string[] = []
    const activityRepos: string[] = []
    const activityDates: string[] = []
    const model = geminiModel()

    const handler = createChatHandler({
      loadKnowledgeIndex,
      readKnowledgeDocument: (id: string): KnowledgeDocument | undefined => {
        const document = readKnowledgeDocument(id)
        if (document) readIds.push(document.id)
        return document
      },
      // Real GitHub, wrapped only to record what was asked for: a suite about
      // whether the assistant reports current work has to exercise the fetch
      // it would make in production, cache and rate limit included.
      fetchActivity: async (repository, onFailure) => {
        activityRepos.push(repository.id)
        const result = await fetchRepositoryActivity(repository, onFailure)
        // The digest is built again here rather than read off the tool
        // result, which never leaves the handler. It is the same pure
        // function on the same payload, so these are the dates the model was
        // given, give or take entries the token cap dropped.
        if (result.kind === 'ok') {
          const digest = toActivityDigest(repository, result.raw)
          for (const date of [
            digest.pushedOn,
            digest.release?.date,
            ...digest.pullRequests.map(pull => pull.mergedOn),
            ...digest.commits.map(commit => commit.date),
          ]) {
            if (date) activityDates.push(date)
          }
        }
        return result
      },
      // The counters are forwarded rather than dropped so the route's own
      // `[chat]` completion line carries real vertexRetries and
      // vertexFirstByteMs for an eval run. Those two numbers are what the
      // timeout constants in lib/ai/bounded-fetch.ts are checked against, and
      // a full suite is the largest sample of them anything here produces.
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
          ...baseMetadata(
            readIds,
            activityRepos,
            activityDates,
            model,
            response.status
          ),
          attempt,
          transportFailure: true,
        }),
        transportFailure:
          attempt < EVAL_TRANSPORT_ATTEMPTS && isTransportCode(code),
      }
    }

    const answer = parseUiMessageStream(body)
    const metadata: EvalMetadata = {
      ...baseMetadata(
        readIds,
        activityRepos,
        activityDates,
        model,
        response.status
      ),
      attempt,
      sourceIds: (answer.metadata.sources ?? []).map(source => source.id),
      followUps: answer.metadata.followUps ?? [],
      finishReason: answer.finishReason,
      ...flags(answer.metadata),
    }

    // The route writes its envelope into the stream's error text when the
    // model fails after the response has already been committed as a 200.
    if (answer.errorText !== undefined) {
      const code = envelopeCode(answer.errorText)
      return {
        response: failure(`CHAT_ERROR: ${code}`, {
          ...metadata,
          transportFailure: true,
        }),
        transportFailure:
          attempt < EVAL_TRANSPORT_ATTEMPTS && isTransportCode(code),
      }
    }

    return {
      response: {
        output: answer.text,
        metadata: {
          ...metadata,
          ...(hasNothingToGrade(answer.text)
            ? { transportFailure: true as const }
            : isUncitedAnswer(answer.text, readIds)
              ? { missingTrailer: true as const }
              : {}),
        },
      },
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
  activityRepos: string[],
  activityDates: string[],
  model: string,
  status: number
): EvalMetadata {
  return {
    readIds,
    activityRepos,
    activityDates,
    sourceIds: [],
    followUps: [],
    model,
    status,
  }
}

function flags(metadata: StreamedMetadata) {
  return {
    ...(metadata.truncated ? { truncated: true as const } : {}),
    ...(metadata.incomplete ? { incomplete: true as const } : {}),
  }
}
