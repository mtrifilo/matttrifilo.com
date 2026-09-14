import { generateText } from 'ai'
import { GEMINI_MODEL, getVertex } from '@/lib/ai/vertex'

// Proves the keyless Vertex AI path end to end (MTC-30 acceptance): one
// generated token through the Vercel OIDC → Workload Identity → Vertex
// chain. Not served in production: it has no rate limit and each hit costs
// a model call. The real chat route (MTC-31) replaces it.
export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }
  const started = Date.now()
  try {
    const result = await generateText({
      model: getVertex()(GEMINI_MODEL),
      prompt: 'Reply with the single word: ok',
      // Gemini 3.x spends output budget on reasoning first; turn it off and
      // leave a few tokens so a word actually comes back.
      maxOutputTokens: 8,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    })
    return Response.json({
      ok: true,
      model: GEMINI_MODEL,
      text: result.text,
      usage: result.usage,
      ms: Date.now() - started,
    })
  } catch (error) {
    // Surface the auth-chain failure class without leaking token material.
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { ok: false, error: message.slice(0, 400) },
      { status: 502 }
    )
  }
}
