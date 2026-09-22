import { generateText, streamText } from 'ai'
import { createVertexCallCounter } from '@/lib/ai/bounded-fetch'
import { geminiModel, getAuthClient, getVertex } from '@/lib/ai/vertex'
import { runCacheProbe } from './cache-probe'
import { failureStage, isHealthRouteEnabled, isHealthy } from './gate'

// Proves the keyless Vertex AI path end to end (MTC-30 acceptance): one
// generated word through the Vercel OIDC → Workload Identity → Vertex
// chain. It has no rate limit and each hit costs a model call, so gate.ts
// serves it only on preview deployments and in local development. The
// rate-limited chat route (MTC-31) replaces it.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isHealthRouteEnabled()) return new Response('Not found', { status: 404 })
  const params = new URL(request.url).searchParams
  // ?stream=1 drives the same prompt through streamText and drains it, so
  // a streaming stall can be told apart from a non-streaming one.
  const streaming = params.get('stream') === '1'
  // ?cache=1 answers a different question — see cache-probe.ts.
  const cacheProbe = params.get('cache') === '1'
  const model = geminiModel()
  const started = Date.now()
  // Per request, and reported on every response below. Without the retry
  // count `modelMs` is confounded: a stalled call that the wrapper abandoned
  // and reopened spends its deadline inside that number while looking like
  // one slow call, and the probe's "first call" would not be the single clean
  // call it reads as. `firstByteMs` is the other half: the wait before
  // Vertex said anything, which is the number the wrapper's deadlines are
  // calibrated against and which `modelMs` folds together with the
  // generation.
  const calls = createVertexCallCounter()
  try {
    // Built inside the try: it reads the five GCP_* variables, and a missing
    // one is a fault this route should classify, not a 500.
    const vertex = getVertex({
      onRetry: calls.observeRetry,
      onFirstByte: calls.observeFirstByte,
    })
    // Phase timing: a slow preview showed every model call stalling for
    // 80 to 110 s while the same call from a laptop took 2 s. Splitting the
    // token exchange from the model call says which side owns the stall.
    const tokenStarted = Date.now()
    await getAuthClient().getAccessToken()
    const tokenMs = Date.now() - tokenStarted
    // Two identical calls, reported per call, rather than one: this mode is
    // asking whether the second one was billed cached input tokens. It costs
    // two model calls with a ~4k-token prefix, which is why it is opt-in and
    // behind the same preview/development gate as everything else here.
    if (cacheProbe) {
      const probe = await runCacheProbe(vertex(model), {
        retries: calls.retries,
      })
      return Response.json(
        {
          ...probe,
          model,
          // Said rather than left out: ?cache=1&stream=1 is a combination the
          // route answers with the probe, which is generateText and never
          // streams. Reporting false stops a reader taking the stream flag
          // they passed as the mode they got.
          streaming: false,
          tokenMs,
          firstByteMs: calls.firstByteMs(),
          ms: Date.now() - started,
        },
        { status: probe.ok ? 200 : 502 }
      )
    }
    const modelStarted = Date.now()
    const result = streaming
      ? await drainStream(vertex, model)
      : await generateText({
          model: vertex(model),
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
        // Above zero means modelMs contains an abandoned connection's wait
        // and a second billed generation, not one slow call.
        retries: calls.retries(),
        // The slowest wait before Vertex sent a byte, which is what
        // VERTEX_FIRST_BYTE_TIMEOUT_MS and VERTEX_LAST_ATTEMPT_TIMEOUT_MS are
        // calibrated against; modelMs cannot answer it, since it also contains
        // the generation.
        firstByteMs: calls.firstByteMs(),
        ms: Date.now() - started,
      },
      { status: ok ? 200 : 502 }
    )
  } catch (error) {
    console.error('[ask/health]', error)
    return Response.json(
      {
        ok: false,
        stage: failureStage(error),
        // Reported on the failure path too: a failure after a stall was
        // billed twice, and a body carrying only a stage cannot say so.
        retries: calls.retries(),
        firstByteMs: calls.firstByteMs(),
      },
      { status: 502 }
    )
  }
}

/** streamText with the health prompt, fully consumed; same shape as generateText's result for the fields the route reports. */
async function drainStream(
  vertex: ReturnType<typeof getVertex>,
  model: string
) {
  const result = streamText({
    model: vertex(model),
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
