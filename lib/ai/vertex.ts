import { createVertex } from '@ai-sdk/google-vertex'
import { getVercelOidcToken } from '@vercel/oidc'
import { ExternalAccountClient } from 'google-auth-library'

/**
 * Vertex AI access from Vercel with no service-account key (MTC-30).
 *
 * The deployment presents its Vercel OIDC token to Google's Workload
 * Identity pool `vercel` in project matttrifilo-com, which exchanges it for
 * a short-lived token impersonating the `vercel-chat` service account. That
 * account holds only roles/aiplatform.user. The six GCP_* variables are set
 * on the Vercel project; `vercel env pull` provides them locally, where
 * `getVercelOidcToken` uses the pulled VERCEL_OIDC_TOKEN.
 */
const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; run \`vercel env pull\``)
  return value
}

export const GEMINI_MODEL = 'gemini-3.8-flash'

// Google recommends the pool provider's own resource URL as the audience;
// the provider is configured for that default and GCP_AUDIENCE carries it.
const audience = () => env('GCP_AUDIENCE')

function createAuthClient() {
  const number = env('GCP_PROJECT_NUMBER')
  const pool = env('GCP_WORKLOAD_IDENTITY_POOL_ID')
  const provider = env('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID')
  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env('GCP_SERVICE_ACCOUNT_EMAIL')}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken({ audience: audience() }),
    },
  })
  if (!client) throw new Error('ExternalAccountClient.fromJSON returned null')
  return client
}

let vertex: ReturnType<typeof createVertex> | undefined

/** Lazily built so importing this module never throws at build time. */
export function getVertex() {
  vertex ??= createVertex({
    project: env('GCP_PROJECT_ID'),
    location: 'us-central1',
    googleAuthOptions: {
      authClient: createAuthClient(),
      projectId: env('GCP_PROJECT_ID'),
    },
  })
  return vertex
}
