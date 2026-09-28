/**
 * What the recorded answer in ./chat-answer.sse says, for the browser checks
 * to assert against (MTC-86).
 *
 * The browser checks never reach the chat route: every POST to /api/chat is
 * answered in the browser with that file. The file itself is not written by
 * hand. ./record-chat-answer.ts produces it by running the route's own
 * handler (lib/chat/handler.ts) against a scripted model that reads one
 * document and then writes the text below, so every byte on the wire, the
 * progress part included, is the handler's; and ./chat-answer.test.ts fails
 * `bun test` when the handler would now write something different, which is
 * how a change to the wire format reaches the fixture.
 *
 * The text says plainly that it is a fixture. It is not an answer about
 * Matt, so nothing here can be mistaken for a claim the assistant makes.
 *
 * No imports: this module is read by Bun (the recorder and its test) and by
 * Playwright under Node.
 */

/**
 * The recorded response body's file name, beside this module. Each reader
 * joins it to its own directory, so nothing depends on where a command was
 * run from.
 */
export const RECORDED_ANSWER_FILE = 'chat-answer.sse'

/**
 * The headers the handler answers a streamed run with. The AI SDK's client
 * reads the body as server-sent events, so the stub sends them as the route
 * does; ./chat-answer.test.ts holds them to the handler's.
 */
export const RECORDED_ANSWER_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'no-cache',
  'content-type': 'text/event-stream',
  'x-accel-buffering': 'no',
  'x-vercel-ai-ui-message-stream': 'v1',
}

/** The one document the scripted model reads, as the index names it. */
export const RECORDED_SOURCE = {
  id: 'resume',
  title: 'Résumé',
  source: 'resume',
  headings: ['Experience', 'Skills'],
} as const

/**
 * The answer's prose, streamed in two pieces. The second paragraph is what a
 * test waits for: it is the last thing on screen once the answer is whole.
 */
export const RECORDED_ANSWER_PARAGRAPHS = [
  'This is a recorded answer used by the browser checks.',
  'It stands in for a briefing so the page can be tested without a model.',
] as const

/**
 * The follow-up questions the answer proposes. Each passes the client's own
 * check (lib/chat/answer.ts): a question, between 12 and 140 characters, no
 * markup, no link.
 */
export const RECORDED_FOLLOW_UPS = [
  'What else does the recorded fixture cover?',
  'Which document would a second question read?',
] as const

/**
 * Milliseconds the run took, as the server reports it in the final progress
 * part. The collapsed summary above the answer shows it in whole seconds.
 */
export const RECORDED_RUN_MS = 3_200

/**
 * The answer as the model writes it: prose, the citation line, then the
 * follow-ups block. The browser strips both trailers before it renders a
 * word, which is one of the things the checks assert.
 */
export function recordedModelText(): string {
  return [
    RECORDED_ANSWER_PARAGRAPHS.join('\n\n'),
    '',
    `Sources: ${RECORDED_SOURCE.id}`,
    'Follow-ups:',
    ...RECORDED_FOLLOW_UPS.map(question => `- ${question}`),
    '',
  ].join('\n')
}
