import { describe, expect, test } from 'bun:test'
import { MockLanguageModelV4 } from 'ai/test'
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider'
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

  test('is above the largest implicit-cache minimum in the model family', () => {
    // 1k to 2k tokens across the Gemini 2.5 models; a shorter prefix is never
    // eligible and would report 0 forever.
    expect(CACHE_PROBE_PREFIX_TOKENS).toBeGreaterThan(2_048)
  })
})

describe('runCacheProbe', () => {
  test('sends the identical prompt twice, in sequence', async () => {
    const { model, prompts } = scripted([reply(4_200, 0), reply(4_200, 4_000)])
    let clock = 0
    const result = await runCacheProbe(model, { now: () => (clock += 100) })

    expect(prompts).toHaveLength(CACHE_PROBE_CALLS)
    expect(prompts[0].prompt).toEqual(prompts[1].prompt)
    expect(result.calls).toEqual([
      { ms: 100, inputTokens: 4_200, cachedInputTokens: 0, ok: true },
      { ms: 100, inputTokens: 4_200, cachedInputTokens: 4_000, ok: true },
    ])
  })

  test('a second call billed cached tokens is the hit being looked for', async () => {
    const { model } = scripted([reply(4_200, 0), reply(4_200, 4_000)])
    const result = await runCacheProbe(model)
    expect(result.cacheHit).toBe(true)
    expect(result.ok).toBe(true)
  })

  test('all zeroes is the answer the ticket is asking about, not a failure', async () => {
    // Two healthy calls that were never billed a cached token: the chain
    // works and the cache does not engage. ok stays true so the reader is not
    // told the deployment is broken.
    const { model } = scripted([reply(4_200, 0), reply(4_200, 0)])
    const result = await runCacheProbe(model)
    expect(result.cacheHit).toBe(false)
    expect(result.ok).toBe(true)
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
    expect(result.calls[0].ok).toBe(false)
    expect(result.ok).toBe(false)
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
    expect(result.calls.map(call => call.cachedInputTokens)).toEqual([0, 0])
    expect(result.cacheHit).toBe(false)
  })
})
