import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_GEMINI_MODEL,
  VERCEL_FEDERATION_ENV_NAMES,
  geminiModel,
  getVertex,
  oidcAudience,
  stsAudience,
  usesVercelFederation,
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

describe('geminiModel', () => {
  test('falls back to the default and honours an override', () => {
    expect(geminiModel({})).toBe(DEFAULT_GEMINI_MODEL)
    expect(geminiModel({ GEMINI_MODEL: 'gemini-next' })).toBe('gemini-next')
  })
})

describe('usesVercelFederation', () => {
  const complete: Record<string, string | undefined> = Object.fromEntries(
    VERCEL_FEDERATION_ENV_NAMES.map(name => [name, 'set'])
  )

  test('needs every federation variable, not a subset', () => {
    expect(usesVercelFederation(complete)).toBe(true)
    expect(usesVercelFederation({})).toBe(false)
    for (const name of VERCEL_FEDERATION_ENV_NAMES) {
      expect(usesVercelFederation({ ...complete, [name]: undefined })).toBe(
        false
      )
      expect(usesVercelFederation({ ...complete, [name]: '' })).toBe(false)
    }
  })
})

describe('getVertex without the Vercel variables', () => {
  test('builds a client from Application Default Credentials', () => {
    const saved = VERCEL_FEDERATION_ENV_NAMES.map(
      name => [name, process.env[name]] as const
    )
    const savedProject = process.env.GCP_PROJECT_ID
    try {
      for (const name of VERCEL_FEDERATION_ENV_NAMES) delete process.env[name]
      process.env.GCP_PROJECT_ID = 'test-project'
      // onRetry forces a fresh client rather than the shared singleton, so
      // this cannot be satisfied by a client another test already built.
      expect(() => getVertex({ onRetry: () => {} })).not.toThrow()
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      if (savedProject === undefined) delete process.env.GCP_PROJECT_ID
      else process.env.GCP_PROJECT_ID = savedProject
    }
  })
})
