import { GoogleAuth } from 'google-auth-library'
import { DEFAULT_GEMINI_MODEL } from '@/lib/ai/vertex'

/**
 * Retry ADC impersonation and a cheap Vertex ping until they work (MTC-32).
 *
 * IAM bindings on a newly granted (or newly consistent) service account can
 * 403 `iam.serviceAccounts.getAccessToken` for a short window after the
 * GitHub OIDC exchange succeeds. The eval suites then record that as
 * `CHAT_ERROR: interrupted` on the first goldens. This script runs after
 * `google-github-actions/auth` and before promptfoo, so the suites start
 * with a token Vertex will accept.
 *
 * The ping is generateContent at thinking `low` on one word: it has to prove
 * Vertex, not the chat route's medium setting.
 */

export const WARMUP_ATTEMPTS = 12
export const WARMUP_BACKOFF_MS = [
  1_000, 2_000, 4_000, 8_000, 8_000, 8_000, 8_000, 8_000, 8_000, 8_000, 8_000,
] as const

export interface VertexWarmup {
  getAccessToken: () => Promise<string>
  ping: (token: string) => Promise<void>
  sleep?: (ms: number) => Promise<void>
  attempts?: number
  backoffMs?: readonly number[]
  log?: (message: string) => void
}

export async function waitForVertex({
  getAccessToken,
  ping,
  sleep = delay,
  attempts = WARMUP_ATTEMPTS,
  backoffMs = WARMUP_BACKOFF_MS,
  log = console.info,
}: VertexWarmup): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('ADC returned an empty access token')
      await ping(token)
      log(`[evals] warmup ok on attempt ${attempt}`)
      return
    } catch (error) {
      lastError = error
      if (attempt >= attempts) break
      const backoff = backoffMs[attempt - 1] ?? backoffMs.at(-1) ?? 1_000
      log(
        `[evals] warmup attempt ${attempt} failed; retrying in ${backoff} ms`
      )
      await sleep(backoff)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Vertex warmup failed')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function generateContentUrl(project: string, model: string): string {
  return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`
}

export async function pingVertex(
  token: string,
  {
    project,
    model = DEFAULT_GEMINI_MODEL,
    fetchImpl = globalThis.fetch,
  }: {
    project: string
    model?: string
    fetchImpl?: (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => Promise<Response>
  }
): Promise<void> {
  const response = await fetchImpl(generateContentUrl(project, model), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
      generationConfig: {
        maxOutputTokens: 16,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Vertex ping ${response.status}: ${body.slice(0, 200)}`)
  }
}

async function accessTokenFromAdc(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  if (!token.token) throw new Error('ADC returned no access token')
  return token.token
}

if (import.meta.main) {
  const project = process.env.GCP_PROJECT_ID
  if (!project) {
    console.error('GCP_PROJECT_ID is not set')
    process.exit(1)
  }
  await waitForVertex({
    getAccessToken: accessTokenFromAdc,
    ping: token => pingVertex(token, { project }),
  })
}
