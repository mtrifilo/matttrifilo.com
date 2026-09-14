import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_GEMINI_MODEL,
  geminiModel,
  oidcAudience,
  readEnv,
  stsAudience,
} from './vertex'

const provider = {
  projectNumber: '123',
  poolId: 'vercel',
  providerId: 'vercel',
}

describe('workload identity audiences', () => {
  test('STS and OIDC audiences name the same provider, differing only in scheme', () => {
    expect(stsAudience(provider)).toBe(
      '//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/vercel/providers/vercel'
    )
    expect(oidcAudience(provider)).toBe(`https:${stsAudience(provider)}`)
  })
})

describe('readEnv', () => {
  test('returns the value when set', () => {
    expect(readEnv('X', { X: 'value' })).toBe('value')
  })
  test('treats missing and empty values the same, naming the variable', () => {
    expect(() => readEnv('GCP_PROJECT_ID', {})).toThrow(
      /GCP_PROJECT_ID is not set/
    )
    expect(() => readEnv('GCP_PROJECT_ID', { GCP_PROJECT_ID: '' })).toThrow(
      /is not set/
    )
  })
})

describe('geminiModel', () => {
  test('falls back to the default and honours an override', () => {
    expect(geminiModel({})).toBe(DEFAULT_GEMINI_MODEL)
    expect(geminiModel({ GEMINI_MODEL: 'gemini-next' })).toBe('gemini-next')
  })
})
