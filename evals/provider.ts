import { geminiModel, getVertex, usesVercelFederation } from '@/lib/ai/vertex'
import { createChatHandler } from '@/lib/chat/handler'
import {
  fetchRepositoryActivity,
  toActivityDigest,
} from '@/lib/chat/github-activity'
import type { EnvSource } from '@/lib/env'
import { loadKnowledgeIndex, readKnowledgeDocument } from '@/lib/knowledge'
import {
  chatRequest,
  envelopeCode,
  historyFrom,
  isTransportCode,
} from './route-request'
import { isUncitedAnswer } from './assertions'
import { createReadLedger, type ReadLedger } from './read-ledger'
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
 * which documents a run read is the ground truth the read assertions and the
 * groundedness suite's citation check judge against, and the handler filters
 * tool chunks out before the response leaves. The wrapper sees every
 * document the store resolved, refused ones included; the stream's progress
 * part says which of them the model was handed (evals/read-ledger.ts).
 * `fetchActivity` is wrapped for the same reason, so a suite can assert which
 * repository a run checked on GitHub (MTC-45).
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

export interface ProviderResponse {
  output: string
  error?: string
  metadata?: EvalMetadata
}

/**
 * Metadata every test can assert on.
 *
 * `readIds` and `refusedIds` are the read ledger described above, split
 * (MTC-80). `readIds` holds the documents whose text the model was handed;
 * `refusedIds` the ones the store resolved and the route then refused for
 * their size or the read budget, which the model saw only as a refusal. Every
 * read assertion judges `readIds` alone, so a refused document can never
 * satisfy one; `refusedIds` is carried for the person reading a red row and
 * for the plumbing check that every id resolved is an indexed one.
 *
 * `activityRepos` is a ledger of the same kind for `recent_activity`: the
 * repositories a run actually fetched from GitHub. It records what got past
 * the allowlist, so an id the model invented never appears in it, and a
 * repository whose fetch then failed does. It is keyed by
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
 *
 * Closed, with no index signature: the assertions read this type, so a key
 * nothing here declares is a type error where it is read rather than a
 * value that is silently absent on every run.
 */
export interface EvalMetadata {
  /** Documents whose text reached the model, distinct, first read first. */
  readIds: string[]
  /** Documents resolved and then refused on every call, distinct. */
  refusedIds: string[]
  /**
   * The stream carried no usable progress part, so no read is proven and
   * `refusedIds` holds everything resolved. Only a red row's reason reads it.
   */
  readsUnproven?: true
  /** Repositories this run fetched activity for, in the order it asked. */
  activityRepos: string[]
  /** ISO dates carried by the digests this run was handed. */
  activityDates: string[]
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
    const session = createEvalChatSession()
    const response = await session.handler(request)
    return session.read(response, await response.text(), attempt)
  }
}

/**
 * One request's handler, built the way every suite builds it, and the reading
 * of its response into what a suite grades.
 *
 * Exported so evals/measure-first-sentence.ts can time the stream as it
 * arrives through the same handler and then grade the finished body through
 * the same reading, rather than keeping a second construction that could
 * drift from this one.
 */
export interface EvalChatSession {
  handler: (request: Request) => Promise<Response>
  /**
   * The finished response, read into the provider's result. `body` is passed
   * in because a caller timing the stream has already consumed it.
   */
  read: (
    response: Response,
    body: string,
    attempt: number
  ) => { response: ProviderResponse; transportFailure: boolean }
  /**
   * Each first byte a model call on this request waited for, in the order
   * they arrived. The route's own log line reports only the slowest; the
   * order is what tells the first step's wait from the answer's.
   */
  firstByteMs: () => readonly number[]
  /** Attempts the fetch wrapper abandoned and reopened on this request. */
  vertexRetries: () => number
}

/**
 * `env` is the handler's environment. A caller comparing thinking levels
 * passes its own copy with `CHAT_REASONING` set rather than mutating
 * `process.env`, which concurrent requests share.
 */
export function createEvalChatSession(
  env: EnvSource = process.env
): EvalChatSession {
  const ledger = createReadLedger(readKnowledgeDocument)
  const activityRepos: string[] = []
  const activityDates: string[] = []
  const firstBytes: number[] = []
  let retries = 0
  const model = geminiModel()

  const handler = createChatHandler({
    loadKnowledgeIndex,
    readKnowledgeDocument: ledger.readKnowledgeDocument,
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
        onRetry: retry => {
          retries += 1
          modelRequest.onVertexRetry(retry)
        },
        onFirstByte: ms => {
          firstBytes.push(ms)
          modelRequest.onVertexFirstByte(ms)
        },
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
    env,
  })

  function read(
    response: Response,
    body: string,
    attempt: number
  ): { response: ProviderResponse; transportFailure: boolean } {
    // A refusal before the stream exists is a JSON envelope, not SSE. Report
    // its code rather than letting the suite assert against an empty answer.
    if (!response.ok) {
      const code = envelopeCode(body)
      return {
        response: failure(`CHAT_ERROR: ${code}`, {
          ...baseMetadata(
            ledger.split(undefined),
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
    const reads = ledger.split(answer.progress)
    const metadata: EvalMetadata = {
      ...baseMetadata(
        reads,
        activityRepos,
        activityDates,
        model,
        response.status
      ),
      attempt,
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
            : isUncitedAnswer(answer.text, reads.readIds)
              ? { missingTrailer: true as const }
              : {}),
        },
      },
      transportFailure: false,
    }
  }

  return {
    handler,
    read,
    firstByteMs: () => firstBytes,
    vertexRetries: () => retries,
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
function failure(message: string, metadata: EvalMetadata): ProviderResponse {
  return { output: message, error: message, metadata }
}

function baseMetadata(
  reads: ReadLedger,
  activityRepos: string[],
  activityDates: string[],
  model: string,
  status: number
): EvalMetadata {
  return {
    readIds: reads.readIds,
    refusedIds: reads.refusedIds,
    ...(reads.readsUnproven ? { readsUnproven: true as const } : {}),
    activityRepos,
    activityDates,
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
