import { describe, expect, test } from 'bun:test'
import { isHealthRouteEnabled } from './route'

// The gate is an allowlist: only preview deployments and local development
// may spend a model call. Anything else, including an unset VERCEL_ENV on a
// non-Vercel host, must be refused.
describe('health route gate', () => {
  test('production is refused', () => {
    expect(
      isHealthRouteEnabled({ VERCEL_ENV: 'production', NODE_ENV: 'production' })
    ).toBe(false)
  })
  test('an unknown or missing environment is refused', () => {
    expect(isHealthRouteEnabled({})).toBe(false)
    expect(isHealthRouteEnabled({ NODE_ENV: 'production' })).toBe(false)
    expect(isHealthRouteEnabled({ NODE_ENV: 'test' })).toBe(false)
  })
  test('preview deployments and local development are allowed', () => {
    expect(
      isHealthRouteEnabled({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })
    ).toBe(true)
    expect(isHealthRouteEnabled({ NODE_ENV: 'development' })).toBe(true)
  })
})
