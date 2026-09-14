import { describe, expect, test } from 'bun:test'
import { failureStage, isHealthRouteEnabled, isHealthy } from './gate'

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

describe('isHealthy', () => {
  test('needs a non-empty reply that did not stop on length', () => {
    expect(isHealthy({ text: 'ok', finishReason: 'stop' })).toBe(true)
    expect(isHealthy({ text: '', finishReason: 'stop' })).toBe(false)
    expect(isHealthy({ text: '   ', finishReason: 'stop' })).toBe(false)
    expect(isHealthy({ text: 'ok', finishReason: 'length' })).toBe(false)
  })
})

describe('failureStage', () => {
  const named = (name: string, message = 'x') =>
    Object.assign(new Error(message), { name })
  test('missing configuration is its own stage', () => {
    expect(
      failureStage(
        new Error('GCP_PROJECT_ID is not set; run `vercel env pull`')
      )
    ).toBe('config')
  })
  test('Vercel OIDC and Google token-exchange failures are auth', () => {
    expect(
      failureStage(named('VercelOidcTokenError', 'Failed to exchange token'))
    ).toBe('auth')
    const gaxios = Object.assign(
      new Error('Request failed with status code 400'),
      {
        config: { url: 'https://sts.googleapis.com/v1/token' },
      }
    )
    expect(failureStage(gaxios)).toBe('auth')
    expect(
      failureStage(
        new Error(
          'impersonation failed at https://iamcredentials.googleapis.com/v1/x'
        )
      )
    ).toBe('auth')
  })
  test('walks the cause chain', () => {
    const wrapped = new Error('outer', { cause: named('VercelOidcTokenError') })
    expect(failureStage(wrapped)).toBe('auth')
  })
  test('anything else is the model leg', () => {
    expect(failureStage(new Error('Publisher model was not found'))).toBe(
      'model'
    )
    expect(failureStage('string error')).toBe('model')
  })
})
