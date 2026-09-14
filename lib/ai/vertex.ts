import { createVertex } from '@ai-sdk/google-vertex'
import { getVercelOidcToken } from '@vercel/oidc'
import { ExternalAccountClient } from 'google-auth-library'

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

/** Configuration values: process.env in production, a plain object in tests. */
export type EnvSource = Record<string, string | undefined>

/** Read a required variable; an empty value counts as missing. */
export function readEnv(name: string, source: EnvSource = process.env): string {
  const value = source[name]
  if (!value) throw new Error(`${name} is not set; run \`vercel env pull\``)
  return value
}

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

let vertex: ReturnType<typeof createVertex> | undefined

/** Lazily built so importing this module never throws at build time. */
export function getVertex() {
  if (!vertex) {
    const projectId = readEnv('GCP_PROJECT_ID')
    const provider: WorkloadIdentityProvider = {
      projectNumber: readEnv('GCP_PROJECT_NUMBER'),
      poolId: readEnv('GCP_WORKLOAD_IDENTITY_POOL_ID'),
      providerId: readEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'),
    }
    vertex = createVertex({
      project: projectId,
      // Gemini 3.x is served from the global endpoint; us-central1 returned
      // "model not found" for this project on the first preview.
      location: 'global',
      googleAuthOptions: {
        authClient: createAuthClient(
          provider,
          readEnv('GCP_SERVICE_ACCOUNT_EMAIL')
        ),
      },
    })
  }
  return vertex
}
