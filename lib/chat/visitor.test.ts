import { describe, expect, test } from 'bun:test'
import { VISITOR_CHECK_TIMEOUT_MS, boundVerdict } from './visitor'

describe('boundVerdict', () => {
  test('passes a prompt verdict through untouched', async () => {
    const verdict = { isBot: false, isVerifiedBot: false, bypassed: false }
    expect(await boundVerdict(Promise.resolve(verdict), 50)).toBe(verdict)
  })

  test('rejects a verdict that never arrives, by name', async () => {
    const never = new Promise<never>(() => {})
    await expect(boundVerdict(never, 5)).rejects.toMatchObject({
      name: 'VisitorCheckTimeout',
    })
  })

  test('passes the classifier’s own failure through', async () => {
    const failure = new Error('classifier down')
    await expect(boundVerdict(Promise.reject(failure), 50)).rejects.toBe(
      failure
    )
  })

  test('the default sits well inside the function limit', () => {
    // Long enough for a slow classification, short enough that a stalled
    // one cannot hold a request open for minutes.
    expect(VISITOR_CHECK_TIMEOUT_MS).toBeGreaterThanOrEqual(1_000)
    expect(VISITOR_CHECK_TIMEOUT_MS).toBeLessThanOrEqual(5_000)
  })
})
