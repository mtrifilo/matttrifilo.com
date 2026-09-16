/**
 * Which leg of the keyless Vertex chain failed.
 *
 * Lives beside the provider rather than in one route because both callers of
 * Vertex need it: the health route (MTC-30) reports the stage to its caller,
 * and the chat route (MTC-31) logs it while telling the visitor nothing.
 */
export type FailureStage = 'config' | 'auth' | 'model'

/**
 * Classify a thrown error. Google's and Vercel's messages name the project,
 * model, and service account, so only this classification ever leaves the
 * server; the error itself belongs in the log, and in the chat route's case
 * not even there, since a provider message can echo the prompt.
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
