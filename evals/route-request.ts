/**
 * Building the request a suite sends, and reading the route's refusal codes
 * back out (MTC-32).
 *
 * The pure half of ./provider.ts. It is separate because these three
 * decisions are the ones that can be wrong in a way no eval run would
 * diagnose: a body shape the route rejects, a history entry silently dropped,
 * or an envelope code misread would all show up as every test failing at
 * once, saying nothing about why. They are cheap to pin, so they are pinned.
 */

/** One prior exchange, as a suite writes it in YAML. */
export interface HistoryTurn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * The body the AI SDK client posts: one text part per message, the question
 * last.
 *
 * Kept identical to what a browser sends, because `validateChatRequest` is
 * the trust boundary the suites are meant to go through rather than around.
 */
export function chatRequest(question: string, history: HistoryTurn[]): Request {
  const messages = [...history, { role: 'user' as const, text: question }].map(
    (turn, index) => ({
      id: `${turn.role}-${index}`,
      role: turn.role,
      parts: [{ type: 'text', text: turn.text }],
    })
  )
  return new Request('https://matttrifilo.com/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
}

/**
 * Prior turns for the multi-turn suites, from the test's `history` var.
 *
 * Anything that is not a `user` or `assistant` turn with text is dropped
 * rather than guessed at: a malformed entry would otherwise reach the route
 * as a body it refuses, and the suite would read that as the assistant
 * failing.
 */
export function historyFrom(
  vars: Record<string, unknown> | undefined
): HistoryTurn[] {
  const history = vars?.history
  if (!Array.isArray(history)) return []
  const turns: HistoryTurn[] = []
  for (const entry of history) {
    if (typeof entry !== 'object' || entry === null) continue
    const { role, text } = entry as { role?: unknown; text?: unknown }
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof text !== 'string') continue
    turns.push({ role, text })
  }
  return turns
}

/** The `code` out of a chat error envelope, or the raw body if it is not one. */
export function envelopeCode(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed === 'object' && parsed !== null) {
      const error = (parsed as { error?: unknown }).error
      if (typeof error === 'object' && error !== null) {
        const code = (error as { code?: unknown }).code
        if (typeof code === 'string') return code
      }
    }
  } catch {
    // Not JSON: fall through to the raw body below.
  }
  return body.slice(0, 200)
}

/**
 * The two codes that mean the model was never reached, or was lost on the way
 * back: a stalled connection the bounded fetch gave up on, and a token
 * exchange or provider call that threw before the stream existed. Every other
 * code is the route deciding something, which is exactly what a suite is for.
 */
export function isTransportCode(code: string): boolean {
  return code === 'interrupted' || code === 'unavailable'
}
