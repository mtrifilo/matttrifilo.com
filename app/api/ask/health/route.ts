import { generateText, streamText } from 'ai'
import { geminiModel, getAuthClient, getVertex } from '@/lib/ai/vertex'
import { failureStage, isHealthRouteEnabled, isHealthy } from './gate'

// Proves the keyless Vertex AI path end to end (MTC-30 acceptance): one
// generated word through the Vercel OIDC → Workload Identity → Vertex
// chain. It has no rate limit and each hit costs a model call, so gate.ts
// serves it only on preview deployments and in local development. The
// rate-limited chat route (MTC-31) replaces it.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isHealthRouteEnabled()) return new Response('Not found', { status: 404 })
  // ?stream=1 drives the same prompt through streamText and drains it, so
  // a streaming stall can be told apart from a non-streaming one.
  const streaming = new URL(request.url).searchParams.get('stream') === '1'
  const model = geminiModel()
  const started = Date.now()
  try {
    // Phase timing: a slow preview showed every model call stalling for
    // 80 to 110 s while the same call from a laptop took 2 s. Splitting the
    // token exchange from the model call says which side owns the stall.
    const tokenStarted = Date.now()
    await getAuthClient().getAccessToken()
    const tokenMs = Date.now() - tokenStarted
    const modelStarted = Date.now()
    const result = streaming
      ? await drainStream(model)
      : await generateText({
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
        streaming,
        tokenMs,
        modelMs: Date.now() - modelStarted,
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

/** streamText with the health prompt, fully consumed; same shape as generateText's result for the fields the route reports. */
async function drainStream(model: string) {
  const result = streamText({
    model: getVertex()(model),
    prompt: 'Reply with the single word: ok',
    reasoning: 'none',
    maxOutputTokens: 1024,
  })
  // fullStream, not textStream: a provider failure arrives as an error part
  // and the result promises then reject with a generic "no output" error,
  // so the real cause has to be lifted out of the stream to reach the
  // route's catch and its stage classification.
  let text = ''
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') text += part.text
    if (part.type === 'error') throw part.error
  }
  return {
    text,
    finishReason: await result.finishReason,
    usage: await result.usage,
  }
}
