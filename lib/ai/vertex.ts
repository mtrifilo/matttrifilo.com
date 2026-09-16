import { createVertex } from '@ai-sdk/google-vertex'
import { getVercelOidcToken } from '@vercel/oidc'
import { ExternalAccountClient } from 'google-auth-library'
import { readEnv, type EnvSource } from '@/lib/env'
import { createBoundedFetch, type BoundedFetchRetry } from './bounded-fetch'

/**
 * Vertex AI access from Vercel with no service-account key (MTC-30).
 *
 * The deployment presents its Vercel OIDC token to Google's Workload
 * Identity pool `vercel` in project matttrifilo-com, which exchanges it for
 * a short-lived token impersonating the `vercel-chat` service account. That
 * account's IAM role (roles/aiplatform.user only) is what bounds privilege;
 * the OAuth scope is the library's cloud-platform default. The five GCP_*
 * variables are set on the Vercel project; `vercel env pull` provides them
 * locally, and @vercel/oidc refreshes the pulled VERCEL_OIDC_TOKEN itself.
 */

/** The pool provider that vouches for the deployment's identity. */
export interface WorkloadIdentityProvider {
  projectNumber: string
  poolId: string
  providerId: string
}

function providerPath(p: WorkloadIdentityProvider): string {
  return `iam.googleapis.com/projects/${p.projectNumber}/locations/global/workloadIdentityPools/${p.poolId}/providers/${p.providerId}`
}

/** Audience Google's STS expects when exchanging the subject token. */
export function stsAudience(p: WorkloadIdentityProvider): string {
  return `//${providerPath(p)}`
}

/**
 * Audience minted into the Vercel OIDC token. The provider is configured for
 * Google's default audience, which is its own resource URL; both spellings
 * derive from one set of parts so they cannot drift apart.
 */
export function oidcAudience(p: WorkloadIdentityProvider): string {
  return `https://${providerPath(p)}`
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

/** Env-driven so the model review can be a config change, not a deploy. */
export function geminiModel(source: EnvSource = process.env): string {
  return source.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
}

/**
 * The variables the Vercel federation needs. All four or none: the external
 * account client cannot be built from a subset.
 */
export const VERCEL_FEDERATION_ENV_NAMES = [
  'GCP_PROJECT_NUMBER',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_SERVICE_ACCOUNT_EMAIL',
] as const

/**
 * Whether this process can present a Vercel OIDC token.
 *
 * On Vercel it always can, and that path is unchanged. Everywhere else there
 * is no Vercel identity to exchange, so the client is left to
 * google-auth-library's Application Default Credentials: the credential file
 * `google-github-actions/auth` writes for the MTC-32 eval job, or a
 * developer's own `gcloud auth application-default login`. Without this the
 * eval suites could only run against a deployment, which is the one thing
 * they must not need.
 */
export function usesVercelFederation(source: EnvSource = process.env): boolean {
  return VERCEL_FEDERATION_ENV_NAMES.every(name => Boolean(source[name]))
}

function createAuthClient(
  provider: WorkloadIdentityProvider,
  serviceAccountEmail: string
) {
  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: stsAudience(provider),
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: () =>
        getVercelOidcToken({ audience: oidcAudience(provider) }),
    },
  })
  // fromJSON only returns null for a type other than external_account; the
  // check exists for the library's nullable signature.
  if (!client) throw new Error('ExternalAccountClient.fromJSON returned null')
  return client
}

let sharedVertex: ReturnType<typeof createVertex> | undefined
let authClient: ReturnType<typeof createAuthClient> | undefined

/**
 * The federated auth client behind getVertex(), shared so the health route
 * can time the token exchange separately from a model call.
 */
export function getAuthClient() {
  if (!authClient) {
    const provider: WorkloadIdentityProvider = {
      projectNumber: readEnv('GCP_PROJECT_NUMBER'),
      poolId: readEnv('GCP_WORKLOAD_IDENTITY_POOL_ID'),
      providerId: readEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'),
    }
    authClient = createAuthClient(
      provider,
      readEnv('GCP_SERVICE_ACCOUNT_EMAIL')
    )
  }
  return authClient
}

export interface VertexClientOptions {
  /**
   * Told about every retry the bounded fetch makes on this client's calls —
   * `VertexCallCounter.observeRetry` at the call sites here. A retry is
   * invisible to the visitor and would otherwise be invisible in the logs of
   * the request that was billed for it, so a request that wants to report its
   * own count asks for a client of its own.
   */
  onRetry?: (retry: BoundedFetchRetry) => void
  /**
   * Told how long each model call waited for its first response byte —
   * `VertexCallCounter.observeFirstByte`. The two deadlines in bounded-fetch
   * are guesses at this number, so every caller that can report it should.
   */
  onFirstByte?: (ms: number) => void
}

/**
 * A Vertex client. Lazily built so importing this module never throws at
 * build time.
 *
 * With either callback, the client is built per call rather than shared: it
 * closes over that request's counter. The cost is an object and a closure —
 * the token cache that matters lives in the shared auth client either way.
 *
 * The shared singleton is therefore the no-callback path, and since MTC-38
 * nothing in production takes it: both callers (the chat route and the health
 * route) pass a per-request counter. It remains for a future caller that has
 * no request to report into, and for tests; a call that reaches it is a call
 * whose retries and first-byte times are measured nowhere.
 */
export function getVertex(options: VertexClientOptions = {}) {
  if (options.onRetry || options.onFirstByte) return createVertexClient(options)
  if (!sharedVertex) sharedVertex = createVertexClient()
  return sharedVertex
}

function createVertexClient(options?: VertexClientOptions) {
  return createVertex({
    project: readEnv('GCP_PROJECT_ID'),
    // Gemini 3.x is served from the global endpoint; us-central1 returned
    // "model not found" for this project on the first preview.
    location: 'global',
    // Federated when the Vercel variables are there, Application Default
    // Credentials when they are not. Omitting googleAuthOptions is what hands
    // the choice to google-auth-library.
    ...(usesVercelFederation()
      ? { googleAuthOptions: { authClient: getAuthClient() } }
      : {}),
    // Bounds time-to-first-byte and retries a connection that stalled before
    // saying anything (MTC-38). It wraps only the model call: the token
    // exchange goes through google-auth-library's own transport and measured
    // near zero throughout the episode that motivated this.
    fetch: createBoundedFetch(options),
  })
}
