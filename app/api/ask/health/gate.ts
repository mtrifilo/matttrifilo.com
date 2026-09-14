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

// Moved to lib/ai when the chat route (MTC-31) became a second caller; the
// classification is a property of the Vertex chain, not of this route.
export { failureStage, type FailureStage } from '@/lib/ai/failure-stage'
