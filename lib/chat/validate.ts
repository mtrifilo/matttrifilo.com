import type { EnvSource } from '@/lib/env'
import { KNOWLEDGE_READ_BUDGET } from '@/lib/knowledge'
import { SYSTEM_PROMPT, type ChatTurn } from './prompt'

/**
 * Every limit the chat route enforces on an incoming request, and the only
 * place a request is judged (MTC-31). Pure and synchronous: the caller hands
 * in an already-parsed body and the document index's token estimate, so the
 * whole policy is reachable from a test without a server, a network, or a
 * model.
 *
 * What the model then reads is a separate budget, enforced per request in
 * read-document.ts. This file only decides what may reach the model at all.
 */

/** Questions one visitor may ask in a single conversation. */
export const CHAT_MAX_TURNS = 8

/**
 * Hard cap on entries in the posted `messages` array, checked before the array
 * is walked at all.
 *
 * The per-turn limits below only bind turns that carry text, so without this
 * cap a body of one real question plus ninety thousand empty assistant turns
 * passes every other check while costing an unbounded parse. A full
 * conversation is at most CHAT_MAX_TURNS questions and their answers.
 */
export const CHAT_MAX_MESSAGES = CHAT_MAX_TURNS * 2

/** Characters in one question. Roughly a long paragraph. */
export const CHAT_MAX_MESSAGE_CHARS = 1_500

/**
 * Visible answer length. The ticket's 600 cut a "summarise every role"
 * answer mid-sentence on the first preview (the model emits no reasoning
 * tokens at its floor level, so this is all answer). 1,000 fits that
 * answer with room; the '[chat] truncated' marker shows if it is still
 * too small.
 */
export const CHAT_MAX_OUTPUT_TOKENS = 1_000

/**
 * Model calls allowed in one request: one per document the model may read,
 * plus the one that writes the answer.
 *
 * A step is a model call and the tool calls it emitted, so this is not the
 * same bound as the read budget — one step can ask for several documents.
 * Both caps are needed: this one stops a model that loops without ever
 * answering, KNOWLEDGE_READ_BUDGET stops one that reads the whole corpus in
 * a single step.
 *
 * `+ 1` and not `+ 2` because `prepareStep` spends the last step on the
 * answer rather than hoping the model volunteers one. That makes a wasted
 * call — a hallucinated id, say — cost a document rather than the answer: the
 * visitor gets a reply drawn from fewer sources instead of an empty bubble.
 * Raising it to `+ 2` would buy one retry back at about a quarter more input
 * tokens per request; the cost note in handler.ts is the reason it is not
 * free.
 *
 * It lives here rather than in handler.ts because the answer cap below is
 * derived from it.
 */
export const CHAT_MAX_STEPS = KNOWLEDGE_READ_BUDGET.maxDocuments + 1

/**
 * Characters in one replayed answer. The client posts the assistant's own
 * earlier answers back with each question, and those run well past
 * CHAT_MAX_MESSAGE_CHARS.
 *
 * CHAT_MAX_OUTPUT_TOKENS is applied per model call, not per answer, and the
 * text of every step reaches the client — a model may narrate before each
 * read. The most the route can write in one answer is therefore every step
 * at its cap, about four characters a token. A real answer is one step's
 * worth, so the gap between typical and possible is the headroom. Exceeding
 * this is a tampered body, not a long conversation, and is refused as
 * `invalid`.
 */
export const CHAT_MAX_ANSWER_CHARS = CHAT_MAX_OUTPUT_TOKENS * CHAT_MAX_STEPS * 4

/**
 * Ceiling on the estimated input tokens of the request the client posts:
 * document index plus system policy plus the conversation so far.
 *
 * 46,000 leaves room for every part of that at its own limit:
 * KNOWLEDGE_INDEX_TOKEN_CEILING caps the index at 8,000, the policy is about
 * 1,400, and a conversation cannot exceed CHAT_MAX_TURNS questions of
 * CHAT_MAX_MESSAGE_CHARS characters (~3,000 tokens) and as many answers of
 * CHAT_MAX_ANSWER_CHARS (~32,000 tokens) — 44,400 or so against this cap.
 * A real conversation sits far below it: an answer that narrates through
 * every step is the ceiling, not the norm.
 *
 * So this is a backstop, not a limit anyone reaches: while the other caps
 * hold, one of them always fires first, and `budget_exceeded` is unreachable
 * from any body a client can post. "The longest conversation the route can
 * produce still fits" in validate.test.ts is what pins that, and it is the
 * test that should fail if the policy or the index ceiling grows past the
 * margin — the alternative is a visitor getting a 400 for staying inside
 * every documented limit. It stays because the sum being safe is a property
 * of four constants that are edited independently, and a cheap check beats
 * trusting that nobody raises one of them.
 *
 * It does not bound the whole generation. Documents arrive mid-loop as tool
 * results, and KNOWLEDGE_READ_BUDGET is what caps those.
 */
export const CHAT_MAX_INPUT_TOKENS = 46_000

/** Low, because the job is reporting what the corpus says, not composing. */
export const CHAT_TEMPERATURE = 0.2

/**
 * Every code the client may receive.
 *
 * `rate_limited` is reserved here and deliberately unused: MTC-34 owns rate
 * limiting and its copy. Defining the code now keeps the client's error
 * handling exhaustive across both branches. `interrupted` is the one code
 * that is never an HTTP rejection: the stream is already a 200 when the
 * model fails, so it travels in the stream's error text instead.
 */
export type ChatErrorCode = ChatRejectionCode | 'rate_limited' | 'interrupted'

/** Codes a request can be refused with before any model call is made. */
export type ChatRejectionCode =
  | 'disabled'
  | 'too_many_turns'
  | 'message_too_long'
  | 'budget_exceeded'
  | 'invalid'
  | 'unavailable'

export interface ChatErrorBody {
  error: { code: ChatErrorCode; message: string }
}

export const CHAT_ERROR_STATUS: Record<
  ChatRejectionCode | 'rate_limited',
  number
> = {
  disabled: 503,
  too_many_turns: 400,
  message_too_long: 400,
  budget_exceeded: 400,
  rate_limited: 429,
  invalid: 400,
  unavailable: 502,
}

/**
 * Copy the UI renders as-is. `rate_limited` is absent on purpose — MTC-34
 * writes that sentence when it writes the limiter.
 */
export const CHAT_ERROR_MESSAGE: Record<
  Exclude<ChatErrorCode, 'rate_limited'>,
  string
> = {
  disabled:
    "Matt's Career Assistant is switched off at the moment. Email Matt at matt.trifilo@gmail.com and he'll answer himself.",
  too_many_turns: `This conversation has reached its limit of ${CHAT_MAX_TURNS} questions. Start a new one to keep going, or email Matt at matt.trifilo@gmail.com.`,
  message_too_long: `That question is longer than ${CHAT_MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters. Trim it a little and send it again.`,
  budget_exceeded:
    'This conversation has grown too long for the assistant to hold in mind. Start a new one and it will pick up fresh.',
  invalid:
    "That request wasn't something the assistant could read. Reload the page and try again.",
  unavailable:
    "The assistant couldn't reach its model just now. Try again in a moment, or email Matt at matt.trifilo@gmail.com.",
  interrupted:
    'The assistant lost its connection part-way through that answer. Ask again, or email Matt at matt.trifilo@gmail.com.',
}

export type ChatRequestValidation =
  | { ok: true; history: ChatTurn[]; userMessage: string }
  | { ok: false; status: number; body: ChatErrorBody }

/** The kill switch. Any other value, including unset, leaves chat serving. */
export function isChatDisabled(env: EnvSource = process.env): boolean {
  return env.CHAT_DISABLED === '1'
}

/**
 * Coarse token estimate at four characters per token. It only has to be good
 * enough to refuse an oversized conversation before it is billed; the real
 * counts come back from the provider in `usage` and are what gets logged.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface ValidateChatRequestInput {
  /** The parsed JSON body the AI SDK client posted. */
  body: unknown
  /** `KnowledgeIndex.tokenEstimate` for the index this request would carry. */
  indexTokenEstimate: number
  env?: EnvSource
}

/**
 * Decide whether a request may reach the model, and reduce it to the plain
 * text the prompt needs.
 *
 * Order matters: the kill switch is answered before the body is inspected at
 * all, then structure, then the cheap per-message limits, then the token
 * budget that depends on the whole conversation.
 */
export function validateChatRequest({
  body,
  indexTokenEstimate,
  env = process.env,
}: ValidateChatRequestInput): ChatRequestValidation {
  if (isChatDisabled(env)) return reject('disabled')

  if (!isRecord(body) || !Array.isArray(body.messages)) return reject('invalid')
  // Before walking the array: an oversized one is refused on its length alone.
  if (body.messages.length > CHAT_MAX_MESSAGES) return reject('too_many_turns')

  const turns = readTurns(body.messages)
  if (!turns) return reject('invalid')
  if (turns.length === 0) return reject('invalid')

  const last = turns[turns.length - 1]
  if (last.role !== 'user' || last.text.trim().length === 0) {
    return reject('invalid')
  }

  const questions = turns.filter(turn => turn.role === 'user').length
  if (questions > CHAT_MAX_TURNS) return reject('too_many_turns')

  // Every replayed turn is client-authored, the assistant ones included, so
  // each role has a cap. A question over its cap is the visitor's to trim;
  // an answer over its cap is one the route never wrote, so the body is not
  // something a real conversation produced.
  for (const turn of turns) {
    if (turn.role === 'user' && turn.text.length > CHAT_MAX_MESSAGE_CHARS) {
      return reject('message_too_long')
    }
    if (turn.role === 'assistant' && turn.text.length > CHAT_MAX_ANSWER_CHARS) {
      return reject('invalid')
    }
  }

  const conversationTokens = turns.reduce(
    (total, turn) => total + estimateTokens(turn.text),
    0
  )
  const inputTokens =
    indexTokenEstimate + estimateTokens(SYSTEM_PROMPT) + conversationTokens
  if (inputTokens > CHAT_MAX_INPUT_TOKENS) return reject('budget_exceeded')

  return {
    ok: true,
    history: turns.slice(0, -1),
    userMessage: last.text,
  }
}

/** Build the structured body for a code. Also used for server-side faults. */
export function chatErrorBody(
  code: Exclude<ChatErrorCode, 'rate_limited'>
): ChatErrorBody {
  return { error: { code, message: CHAT_ERROR_MESSAGE[code] } }
}

function reject(code: ChatRejectionCode): ChatRequestValidation {
  return {
    ok: false,
    status: CHAT_ERROR_STATUS[code],
    body: chatErrorBody(code),
  }
}

/**
 * Reduce the AI SDK's `UIMessage[]` to roles and text, or `null` if it is not
 * that shape. This is the trust boundary: only `user` and `assistant` roles
 * and only text parts survive, so a client cannot smuggle in a system message,
 * a file, or a tool result to steer the model.
 */
function readTurns(messages: unknown[]): ChatTurn[] | null {
  const turns: ChatTurn[] = []
  for (const message of messages) {
    if (!isRecord(message)) return null
    if (message.role !== 'user' && message.role !== 'assistant') return null
    if (!Array.isArray(message.parts)) return null

    let text = ''
    for (const part of message.parts) {
      if (!isRecord(part)) return null
      // The AI SDK marks each model step in a replayed assistant message
      // with a `step-start` part. It carries nothing, so skipping it cannot
      // change what the model is asked; refusing it broke every second turn
      // on the first UI preview.
      if (part.type === 'step-start') continue
      // Any other non-text part is refused rather than dropped: silently
      // ignoring one would answer a different question than the visitor
      // sees on screen.
      if (part.type !== 'text' || typeof part.text !== 'string') return null
      text += part.text
    }
    if (text.trim().length === 0) {
      // A run that spent every step reading, or was cut off before its
      // first word, leaves an answer with no text, and the client replays
      // it like any other. Dropping it here keeps the conversation usable;
      // CHAT_MAX_MESSAGES already bounds how many such turns a body can
      // carry. A blank question, though, is not a question.
      if (message.role === 'assistant') continue
      return null
    }
    turns.push({ role: message.role, text })
  }
  return turns
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
