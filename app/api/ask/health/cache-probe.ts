import { generateText, type LanguageModel } from 'ai'
import { cachedInputTokens } from '@/lib/chat/handler'
import { estimateTokens } from '@/lib/chat/validate'
import { isHealthy } from './gate'

/**
 * Does Vertex's implicit cache ever report a hit on this deployment? (MTC-38)
 *
 * The chat route logs `cachedInputTokens` on every request, and three
 * identical questions in a row came back with 0. That has two very different
 * explanations — the cache never engages on this path, or the prefix was not
 * identical because something in the prompt varies per request — and telling
 * them apart needs two calls whose prefix is identical by construction. This
 * runs exactly that: the same prompt twice, back to back, reporting what each
 * call was billed. It answers the question from a preview deployment, which
 * is where the 0s were seen; a laptop cannot reproduce that path.
 *
 * Why not reuse the one-word health prompt: Gemini's implicit cache ignores a
 * prefix below some model-specific minimum, so a one-line prompt could report
 * 0 forever and prove nothing.
 *
 * What that minimum is for gemini-3.8-flash is an OPEN QUESTION. No figure
 * for this model has been read out of Google's documentation by anyone here,
 * and an earlier draft of this comment justified the prefix size with numbers
 * quoted for the Gemini 2.5 family, which is not the model this deployment
 * runs. Rather than pick a number, the consequence is built into the result:
 * a probe that sees no hit reports `inconclusive`, because "the cache does
 * not engage on this path" and "the prefix was under a minimum nobody here
 * has confirmed" are indistinguishable from outside. Only a hit is a
 * conclusive answer; resolving the negative case needs the documented minimum
 * for this model, or a sweep of prefix sizes.
 */

/**
 * Prefix size for the probe.
 *
 * Chosen to be large enough to be plausibly eligible and small enough to be
 * cheap: it is a fraction of what the chat route sends (CHAT_MAX_INPUT_TOKENS
 * is 26,000) and still several times any implicit-cache minimum this repo has
 * seen claimed for any Gemini model. It is a guess at a threshold nobody here
 * has verified for gemini-3.8-flash — see the open question above — and
 * `prefixTokenEstimate` is reported on every result so a reader can judge it
 * against whatever the real minimum turns out to be.
 */
export const CACHE_PROBE_PREFIX_TOKENS = 4_096

/** Two calls: one to write the cache, one to read it. */
export const CACHE_PROBE_CALLS = 2

/** Kept small — the probe pays for output twice and only needs a word back. */
const CACHE_PROBE_MAX_OUTPUT_TOKENS = 1_024

const CACHE_PROBE_PROMPT = 'Reply with the single word: ok'

/**
 * Deterministic filler, by construction byte-identical on every call and
 * every request — no clock, no randomness, no environment. If a hit fails to
 * show up here, the prefix is not the reason.
 */
export function cacheProbePrefix(
  tokens: number = CACHE_PROBE_PREFIX_TOKENS
): string {
  const header =
    'Ignore this padding. It exists only to make the prompt long enough for an implicit cache lookup.\n'
  let prefix = header
  // Measured on the whole text each time, not summed per line: estimateTokens
  // rounds up, and summing the rounding would stop the loop short of the
  // target the caller asked for.
  for (let line = 1; estimateTokens(prefix) < tokens; line++) {
    prefix += `${line}. Padding line for the Vertex implicit cache probe; it carries no instruction.\n`
  }
  return prefix
}

/** What one probe call was billed, how long it took, and how clean it was. */
export interface CacheProbeCall {
  ms: number
  inputTokens: number
  cachedInputTokens: number
  /** A word came back; a failed call says nothing about the cache. */
  ok: boolean
  /**
   * Connections the Vertex wrapper abandoned and reopened during this call.
   * Above zero, `ms` contains a stalled connection's wait and the prompt
   * reached Vertex more than once, so neither the duration nor the "this is
   * the call that writes the cache" assumption holds as written.
   */
  retries: number
}

/** Why a probe run cannot answer the question it was run to answer. */
export type CacheProbeInconclusiveReason =
  /** A call produced no word, so it is not evidence about anything. */
  | 'call-failed'
  /** A hidden retry sent the prefix more than the probe's own calls did. */
  | 'retried'
  /** No hit — and the minimum eligible prefix for this model is unknown. */
  | 'no-hit-and-minimum-unknown'

export interface CacheProbeResult {
  /**
   * One entry per call the probe made, in order. Named `results` rather than
   * `calls` so it cannot be misread as the *number* of calls, which is what
   * CACHE_PROBE_CALLS and the `calls` option mean.
   */
  results: CacheProbeCall[]
  /** Any call after the first that was billed cached input tokens. */
  cacheHit: boolean
  /** Every call produced an answer, whether or not the cache engaged. */
  ok: boolean
  prefixTokenEstimate: number
  /** Hidden Vertex retries across the whole run. Zero on a clean probe. */
  retries: number
  /**
   * The first call reached Vertex exactly once. The probe's reading rests on
   * it — it is the call that writes the cache — so it is reported rather than
   * assumed.
   */
  firstCallClean: boolean
  /** Absent when the run answered the question; see the reason beside it. */
  inconclusive?: true
  reason?: CacheProbeInconclusiveReason
}

export interface CacheProbeOptions {
  calls?: number
  prefix?: string
  /** Injected so the durations are assertable. */
  now?: () => number
  /**
   * Reads this request's retry counter (`VertexCallCounter.retries`). The
   * probe takes differences across it to attribute retries to calls.
   */
  retries?: () => number
}

/**
 * Send the same prompt `calls` times in sequence and report each call's
 * billed input, cached and total.
 *
 * Sequential is the whole point: the first call is what populates the cache,
 * so a second call issued in parallel with it would race the write and read 0
 * for a reason that has nothing to do with the deployment.
 */
export async function runCacheProbe(
  model: LanguageModel,
  {
    calls = CACHE_PROBE_CALLS,
    prefix,
    now = Date.now,
    retries = () => 0,
  }: CacheProbeOptions = {}
): Promise<CacheProbeResult> {
  const system = prefix ?? cacheProbePrefix()
  const results: CacheProbeCall[] = []
  const retriesBefore = retries()

  for (let call = 0; call < calls; call++) {
    const started = now()
    const retriesAtStart = retries()
    const result = await generateText({
      model,
      system,
      prompt: CACHE_PROBE_PROMPT,
      // Same generation settings as the plain health call, so the only thing
      // that differs between the two modes is the size of the prefix.
      reasoning: 'none',
      maxOutputTokens: CACHE_PROBE_MAX_OUTPUT_TOKENS,
    })
    results.push({
      ms: now() - started,
      inputTokens: result.usage.inputTokens ?? 0,
      cachedInputTokens: cachedInputTokens(result.usage),
      ok: isHealthy(result),
      retries: retries() - retriesAtStart,
    })
  }

  // The first call cannot hit: it is the one that writes the cache. Only what
  // follows it is evidence either way.
  const cacheHit = results.slice(1).some(call => call.cachedInputTokens > 0)
  const ok = results.length > 0 && results.every(call => call.ok)
  const firstCallClean = results.length > 0 && results[0].retries === 0

  return {
    results,
    cacheHit,
    ok,
    prefixTokenEstimate: estimateTokens(system),
    retries: retries() - retriesBefore,
    firstCallClean,
    ...inconclusive({ cacheHit, ok, firstCallClean }),
  }
}

/**
 * Whether this run answers the question, and if not, which way it failed to.
 *
 * A hit is the one conclusive outcome: identical prompts were billed cached
 * tokens, so the mechanism works on this path. Everything else leaves the
 * reader with a 0 that could mean several things, and saying which ones is
 * the honest report.
 */
function inconclusive({
  cacheHit,
  ok,
  firstCallClean,
}: Pick<CacheProbeResult, 'cacheHit' | 'ok' | 'firstCallClean'>):
  | { inconclusive: true; reason: CacheProbeInconclusiveReason }
  | Record<string, never> {
  if (!ok) return { inconclusive: true, reason: 'call-failed' }
  if (cacheHit) return {}
  if (!firstCallClean) return { inconclusive: true, reason: 'retried' }
  return { inconclusive: true, reason: 'no-hit-and-minimum-unknown' }
}
