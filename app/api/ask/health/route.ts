import { generateText } from 'ai'
import { geminiModel, getVertex } from '@/lib/ai/vertex'
import { failureStage, isHealthRouteEnabled, isHealthy } from './gate'

// Proves the keyless Vertex AI path end to end (MTC-30 acceptance): one
// generated word through the Vercel OIDC → Workload Identity → Vertex
// chain. It has no rate limit and each hit costs a model call, so gate.ts
// serves it only on preview deployments and in local development. The
// rate-limited chat route (MTC-31) replaces it.
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isHealthRouteEnabled()) return new Response('Not found', { status: 404 })
  const model = geminiModel()
  const started = Date.now()
  try {
    const result = await generateText({
      model: getVertex()(model),
      prompt: 'Reply with the single word: ok',
      // Gemini 3.x reasons before it answers and cannot have that fully
      // disabled; ask for the least of it and leave the budget slack so a
      // chattier thought never trips the length check on a healthy chain.
      reasoning: 'none',
      maxOutputTokens: 1024,
    })
    const ok = isHealthy(result)
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
    console.error('[ask/health]', error)
    return Response.json(
      { ok: false, stage: failureStage(error) },
      { status: 502 }
    )
  }
}
