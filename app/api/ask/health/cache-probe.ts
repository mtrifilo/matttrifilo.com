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
 * Why not reuse the one-word health prompt: Gemini's implicit cache ignores
 * prefixes below a model-specific minimum (1 to 2k tokens across the 2.5
 * family). A one-line prompt can never hit, however many times it is sent, so
 * a probe built on it would report 0 forever and prove nothing.
 */

/**
 * Prefix size for the probe, comfortably above the largest implicit-cache
 * minimum published for the model family and still a fraction of what the
 * chat route sends (~26k for the policy and index). Big enough to be eligible
 * is all this has to be — it is measuring whether the mechanism works at all,
 * not reproducing the chat prompt.
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

/** What one probe call was billed, and how long it took. */
export interface CacheProbeCall {
  ms: number
  inputTokens: number
  cachedInputTokens: number
  /** A word came back; a failed call says nothing about the cache. */
  ok: boolean
}

export interface CacheProbeResult {
  calls: CacheProbeCall[]
  /** Any call after the first that was billed cached input tokens. */
  cacheHit: boolean
  /** Every call produced an answer, whether or not the cache engaged. */
  ok: boolean
  prefixTokenEstimate: number
}

export interface CacheProbeOptions {
  calls?: number
  prefix?: string
  /** Injected so the durations are assertable. */
  now?: () => number
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
  { calls = CACHE_PROBE_CALLS, prefix, now = Date.now }: CacheProbeOptions = {}
): Promise<CacheProbeResult> {
  const system = prefix ?? cacheProbePrefix()
  const results: CacheProbeCall[] = []

  for (let call = 0; call < calls; call++) {
    const started = now()
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
    })
  }

  return {
    calls: results,
    // The first call cannot hit: it is the one that writes the cache. Only
    // what follows it is evidence either way.
    cacheHit: results.slice(1).some(call => call.cachedInputTokens > 0),
    ok: results.length > 0 && results.every(call => call.ok),
    prefixTokenEstimate: estimateTokens(system),
  }
}
