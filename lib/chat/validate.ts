import type { EnvSource } from '@/lib/env'
import { SYSTEM_PROMPT, type ChatTurn } from './prompt'

/**
 * Every limit the chat route enforces, and the only place a request is judged
 * (MTC-31). Pure and synchronous: the caller hands in an already-parsed body
 * and the knowledge base's token estimate, so the whole policy is reachable
 * from a test without a server, a network, or a model.
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
 * Ceiling on the estimated input tokens of an entire request: knowledge base
 * plus system policy plus the conversation so far.
 *
 * 24,000 = 16,000 for the corpus (KNOWLEDGE_TOKEN_CEILING, which MTC-29
 * enforces at build time) + ~8,000 for a worst-case conversation: eight
 * questions of 1,500 characters (~3,000 tokens), seven answers at the
 * CHAT_MAX_OUTPUT_TOKENS ceiling (~4,200 tokens), and the policy itself
 * (~800 tokens). A request over this cap means the client has replayed a
 * history longer than the route ever produced, so it is refused rather than
 * silently billed.
 */
export const CHAT_MAX_INPUT_TOKENS = 24_000

/** Visible answer length. */
export const CHAT_MAX_OUTPUT_TOKENS = 600

/** Low, because the job is reporting what the corpus says, not composing. */
export const CHAT_TEMPERATURE = 0.2

/**
 * `rate_limited` is reserved here and deliberately unused: MTC-34 owns rate
 * limiting and its copy. Defining the code now keeps the client's error
 * handling exhaustive across both branches.
 */
export type ChatErrorCode =
  | 'disabled'
  | 'too_many_turns'
  | 'message_too_long'
  | 'budget_exceeded'
  | 'rate_limited'
  | 'invalid'
  | 'unavailable'

export interface ChatErrorBody {
  error: { code: ChatErrorCode; message: string }
}

export const CHAT_ERROR_STATUS: Record<ChatErrorCode, number> = {
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
  /** `KnowledgeBase.tokenEstimate` for the corpus this request would carry. */
  kbTokenEstimate: number
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
  kbTokenEstimate,
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

  const overlong = turns.some(
    turn => turn.role === 'user' && turn.text.length > CHAT_MAX_MESSAGE_CHARS
  )
  if (overlong) return reject('message_too_long')

  const conversationTokens = turns.reduce(
    (total, turn) => total + estimateTokens(turn.text),
    0
  )
  const inputTokens =
    kbTokenEstimate + estimateTokens(SYSTEM_PROMPT) + conversationTokens
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

function reject(
  code: Exclude<ChatErrorCode, 'rate_limited'>
): ChatRequestValidation {
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
      // Non-text parts are refused rather than dropped: silently ignoring one
      // would answer a different question than the visitor sees on screen.
      if (part.type !== 'text' || typeof part.text !== 'string') return null
      text += part.text
    }
    // An empty turn is not a turn. Refusing them here is what keeps the
    // budget honest: a blank turn estimates at zero tokens, so a conversation
    // padded with them would otherwise slip under every limit below.
    if (text.trim().length === 0) return null
    turns.push({ role: message.role, text })
  }
  return turns
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
