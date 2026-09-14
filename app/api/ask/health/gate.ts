import type { EnvSource } from '@/lib/env'

// The health route's rules live here, not in route.ts: Next's route-module
// type check (strict under webpack) rejects non-handler exports, and pure
// functions are what the tests can reach without a network.

/**
 * Allowlist: only preview deployments (behind Vercel deployment protection)
 * and local development may spend a model call. Anything else, including an
 * unset VERCEL_ENV on a non-Vercel host, is refused.
 */
export function isHealthRouteEnabled(env: EnvSource = process.env): boolean {
  return env.VERCEL_ENV === 'preview' || env.NODE_ENV === 'development'
}

/** "Healthy" means a word came back, not merely that the call returned. */
export function isHealthy(result: {
  text: string
  finishReason: string
}): boolean {
  return result.text.trim().length > 0 && result.finishReason !== 'length'
}

export type FailureStage = 'config' | 'auth' | 'model'

/**
 * Which leg failed, for the caller. Google's and Vercel's messages name the
 * project, model, and service account, so only this classification leaves
 * the server; the full error goes to the log.
 */
export function failureStage(error: unknown): FailureStage {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (/is not set; run `vercel env pull`/.test(e.message)) return 'config'
    if (e.name === 'VercelOidcTokenError') return 'auth'
    const url = (e as { config?: { url?: string } }).config?.url ?? ''
    if (
      /sts\.googleapis|iamcredentials\.googleapis|oidc\.vercel/i.test(
        `${url} ${e.message}`
      )
    ) {
      return 'auth'
    }
  }
  return 'model'
}
