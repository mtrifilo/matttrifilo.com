import { generateText } from 'ai'
import { geminiModel, getVertex, type EnvSource } from '@/lib/ai/vertex'

// Proves the keyless Vertex AI path end to end (MTC-30 acceptance): one
// generated word through the Vercel OIDC → Workload Identity → Vertex
// chain. It has no rate limit and each hit costs a model call, so it is
// served only where two controls hold: preview deployments, which sit
// behind Vercel deployment protection, and local development. Everywhere
// else, including production and any non-Vercel host, it is a 404. The
// rate-limited chat route (MTC-31) replaces it.
export const dynamic = 'force-dynamic'

export function isHealthRouteEnabled(env: EnvSource = process.env): boolean {
  return env.VERCEL_ENV === 'preview' || env.NODE_ENV === 'development'
}

export async function GET() {
  if (!isHealthRouteEnabled()) return new Response('Not found', { status: 404 })
  const model = geminiModel()
  const started = Date.now()
  try {
    const result = await generateText({
      model: getVertex()(model),
      prompt: 'Reply with the single word: ok',
      // Gemini 3.x spends output budget on reasoning first and cannot have
      // it fully disabled, so leave headroom rather than a one-token cap.
      maxOutputTokens: 128,
    })
    // "ok" means a word came back, not merely that the call returned.
    const ok = result.text.trim().length > 0 && result.finishReason !== 'length'
    return Response.json(
      {
        ok,
        model,
        text: result.text,
        finishReason: result.finishReason,
        usage: result.usage,
        ms: Date.now() - started,
      },
      { status: ok ? 200 : 502 }
    )
  } catch (error) {
    // Google's messages name the project, model, and service account; keep
    // them in the server log and hand the caller only the failing stage.
    console.error('[ask/health]', error)
    const message = error instanceof Error ? error.message : String(error)
    const stage = /sts\.googleapis|iamcredentials|oidc|subject token/i.test(
      message
    )
      ? 'auth'
      : 'model'
    return Response.json({ ok: false, stage }, { status: 502 })
  }
}
