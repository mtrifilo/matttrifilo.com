/**
 * The chat route's response, for component tests that render /ask: the AI
 * SDK's UI message stream as server-sent events.
 *
 * `answered` is a whole answer delivered at once. `openStream` is one that
 * arrives a chunk at a time, for a test that needs to look at the page
 * between chunks (a live region that must not change on every token), and
 * a stream that is never closed is a run still in flight.
 */

const HEADERS = {
  'content-type': 'text/event-stream',
  'x-vercel-ai-ui-message-stream': 'v1',
}

function event(chunk: unknown): string {
  return `data: ${JSON.stringify(chunk)}\n\n`
}

/** A response carrying every chunk, then the end of the stream. */
export function answered(chunks: readonly unknown[]): Response {
  return new Response(`${chunks.map(event).join('')}data: [DONE]\n\n`, {
    headers: HEADERS,
  })
}

export interface OpenStream {
  response: Response
  /** Sends one chunk to the page. */
  push(chunk: unknown): void
  /** Ends the stream as the route does after `finish`. */
  close(): void
}

/** A response whose chunks the test sends one at a time. */
export function openStream(): OpenStream {
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
    },
  })
  return {
    response: new Response(body, { headers: HEADERS }),
    push(chunk) {
      controller.enqueue(encoder.encode(event(chunk)))
    },
    close() {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  }
}
