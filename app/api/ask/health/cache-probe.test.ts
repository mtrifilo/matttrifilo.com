import { describe, expect, test } from 'bun:test'
import { MockLanguageModelV4 } from 'ai/test'
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider'
import { CHAT_MAX_INPUT_TOKENS } from '@/lib/chat/validate'
import {
  CACHE_PROBE_CALLS,
  CACHE_PROBE_PREFIX_TOKENS,
  cacheProbePrefix,
  runCacheProbe,
} from './cache-probe'

/** Usage as the Vertex provider reports it: cacheRead is the cache's answer. */
function usage(total: number, cacheRead: number) {
  return {
    inputTokens: {
      total,
      noCache: total - cacheRead,
      cacheRead,
      cacheWrite: 0,
    },
    outputTokens: { total: 2, text: 2, reasoning: 0 },
  }
}

function reply(total: number, cacheRead: number, text = 'ok') {
  return {
    content: text ? [{ type: 'text' as const, text }] : [],
    finishReason: { unified: 'stop' as const, raw: 'STOP' },
    usage: usage(total, cacheRead),
    warnings: [],
  }
}

/** A model that answers with the scripted usages, in order. */
function scripted(replies: ReturnType<typeof reply>[]) {
  const prompts: LanguageModelV4CallOptions[] = []
  let call = 0
  const model = new MockLanguageModelV4({
    doGenerate: async options => {
      prompts.push(options)
      return replies[call++] ?? replies[replies.length - 1]
    },
  })
  return { model, prompts }
}

describe('cacheProbePrefix', () => {
  test('reaches the token target and is byte-identical every time', () => {
    const prefix = cacheProbePrefix()
    expect(prefix).toBe(cacheProbePrefix())
    expect(Math.ceil(prefix.length / 4)).toBeGreaterThanOrEqual(
      CACHE_PROBE_PREFIX_TOKENS
    )
  })

  test('the prefix size is a guess at an unknown threshold, and says so', () => {
    // OPEN QUESTION (MTC-38): the minimum prefix Gemini's implicit cache will
    // consider on gemini-3.8-flash. No figure for this model has been read
    // out of Google's documentation by anyone here, so there is nothing to
    // assert the prefix clears. What is asserted instead is the consequence:
    // the probe is large enough to be worth running, small enough to stay a
    // fraction of the chat prompt, and a negative result from it is reported
    // as inconclusive rather than as an answer (below).
    expect(CACHE_PROBE_PREFIX_TOKENS).toBeGreaterThan(0)
    expect(CACHE_PROBE_PREFIX_TOKENS).toBeLessThan(CHAT_MAX_INPUT_TOKENS)
  })
})

describe('runCacheProbe', () => {
  test('sends the identical prompt twice, in sequence', async () => {
    const { model, prompts } = scripted([reply(4_200, 0), reply(4_200, 4_000)])
    let clock = 0
    const result = await runCacheProbe(model, { now: () => (clock += 100) })

    expect(prompts).toHaveLength(CACHE_PROBE_CALLS)
    expect(prompts[0].prompt).toEqual(prompts[1].prompt)
    expect(result.results).toEqual([
      {
        ms: 100,
        inputTokens: 4_200,
        cachedInputTokens: 0,
        ok: true,
        retries: 0,
      },
      {
        ms: 100,
        inputTokens: 4_200,
        cachedInputTokens: 4_000,
        ok: true,
        retries: 0,
      },
    ])
  })

  test('a second call billed cached tokens is the hit being looked for', async () => {
    const { model } = scripted([reply(4_200, 0), reply(4_200, 4_000)])
    const result = await runCacheProbe(model)
    expect(result.cacheHit).toBe(true)
    expect(result.ok).toBe(true)
    // The one conclusive outcome the probe can produce.
    expect(result.inconclusive).toBeUndefined()
    expect(result.reason).toBeUndefined()
  })

  test('all zeroes is reported as inconclusive, not as "the cache is off"', async () => {
    // Two healthy calls that were never billed a cached token. ok stays true
    // so the reader is not told the deployment is broken — but this cannot be
    // read as "the cache does not engage on this path" either, because the
    // minimum prefix this model needs to be eligible is unknown (see the
    // open question in cache-probe.ts). Both readings survive, so the result
    // says so rather than picking one.
    const { model } = scripted([reply(4_200, 0), reply(4_200, 0)])
    const result = await runCacheProbe(model)
    expect(result.cacheHit).toBe(false)
    expect(result.ok).toBe(true)
    expect(result.inconclusive).toBe(true)
    expect(result.reason).toBe('no-hit-and-minimum-unknown')
  })

  test('a hit on the first call alone is not counted', async () => {
    // Only a call that follows another identical call is evidence; the first
    // one is what writes the cache.
    const { model } = scripted([reply(4_200, 4_000), reply(4_200, 0)])
    expect((await runCacheProbe(model)).cacheHit).toBe(false)
  })

  test('a call that produced no word makes the probe unhealthy', async () => {
    const { model } = scripted([reply(4_200, 0, ''), reply(4_200, 4_000)])
    const result = await runCacheProbe(model)
    expect(result.results[0].ok).toBe(false)
    expect(result.ok).toBe(false)
    expect(result.inconclusive).toBe(true)
    expect(result.reason).toBe('call-failed')
  })

  test('a retried first call is not the clean cache write the probe reads it as', async () => {
    // The wrapper can abandon a stalled connection and open a second one.
    // The visitor of the health route sees one "first call"; Vertex saw two,
    // and the ms of that call contains a deadline's wait. Both readings the
    // probe rests on are then off, so it says the run was not clean.
    let retries = 0
    let call = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        // The stalled connection is abandoned and reopened mid-call.
        if (call++ === 0) retries += 1
        return reply(4_200, 0)
      },
    })
    const result = await runCacheProbe(model, { retries: () => retries })

    expect(result.results[0].retries).toBe(1)
    expect(result.retries).toBe(1)
    expect(result.firstCallClean).toBe(false)
    expect(result.inconclusive).toBe(true)
    expect(result.reason).toBe('retried')
  })

  test('a clean run reports zero retries and says the first call was clean', async () => {
    const { model } = scripted([reply(4_200, 0), reply(4_200, 4_000)])
    const result = await runCacheProbe(model)
    expect(result.retries).toBe(0)
    expect(result.firstCallClean).toBe(true)
    expect(result.results.map(call => call.retries)).toEqual([0, 0])
  })

  test('the prefix goes up as a system instruction, which is what Vertex keys on', async () => {
    const { model, prompts } = scripted([reply(4_200, 0), reply(4_200, 0)])
    await runCacheProbe(model, { prefix: 'padding', calls: 1 })
    expect(prompts).toHaveLength(1)
    expect(prompts[0].prompt[0]).toEqual({ role: 'system', content: 'padding' })
    expect(prompts[0].prompt).toHaveLength(2)
  })

  test('a missing usage mapping reads as no cached tokens, not a crash', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text' as const, text: 'ok' }],
        finishReason: { unified: 'stop' as const, raw: 'STOP' },
        usage: {
          inputTokens: {
            total: 4_200,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 2, text: 2, reasoning: 0 },
        },
        warnings: [],
      }),
    })
    const result = await runCacheProbe(model)
    expect(result.results.map(call => call.cachedInputTokens)).toEqual([0, 0])
    expect(result.cacheHit).toBe(false)
  })
})
