import type { EnvSource } from '@/lib/env'
import { KNOWLEDGE_READ_BUDGET } from '@/lib/knowledge'
import { isChatDisabled } from './kill-switch'
import { CHAT_MAX_MESSAGE_CHARS } from './answer'
import { PROGRESS_PART_TYPE } from './progress'
import { REPOSITORY_BLOCK, SYSTEM_PROMPT, type ChatTurn } from './prompt'

export { CHAT_MAX_MESSAGE_CHARS }

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

/**
 * Visible answer length, shared with Gemini 3.x thought tokens.
 *
 * Briefings at thinking `medium` were still being cut at 2,048 — thought
 * tokens come out of this budget first, then the visible answer. 8,192
 * leaves room for a hiring-manager briefing after a medium think. The
 * input ceiling below is raised with it so a conversation of full-length
 * answers still fits. The '[chat] truncated' marker shows if it is still
 * too small.
 */
export const CHAT_MAX_OUTPUT_TOKENS = 8_192

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
 *
 * It did not grow when `recent_activity` was added (MTC-45), and it cannot.
 * A step is a model call and every tool call it emitted, so a model may ask
 * for the GitHub check and a document in the same step; three tool-calling
 * steps are enough for the three documents and the three checks the budgets
 * allow. The bound that says it cannot grow is in lib/ai/bounded-fetch.ts: a
 * model call's worst-case wait is 67,500 ms, and four of them are exactly
 * VERTEX_REQUEST_WAIT_BUDGET_MS. A fifth step would put a stalling request
 * past Vercel's 300 s function limit, so raising this means lowering those
 * timeouts first. `bounded-fetch.test.ts` fails if it is raised here alone.
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
 * 80,000 fits every conversation a visitor can have with ordinary answers:
 * KNOWLEDGE_INDEX_TOKEN_CEILING caps the index at 8,000, the policy is about
 * 1,800 after the briefing rewrite, CHAT_MAX_TURNS questions at
 * CHAT_MAX_MESSAGE_CHARS are ~3,000 tokens, and as many answers of one
 * step's worth of text (CHAT_MAX_OUTPUT_TOKENS each) are ~65,500 — about
 * 78,300 against this cap. "A conversation of full-length answers still
 * fits" in validate.test.ts pins that, and it is the test that should fail
 * if the policy or the index ceiling grows past the margin.
 *
 * It is deliberately below the sum of the caps, though. CHAT_MAX_ANSWER_CHARS
 * allows an answer that narrated through every step, and eight of those in
 * one body would double the worst-case billing of a request on a route that
 * has no rate limit until MTC-34. A conversation like that is refused with
 * `budget_exceeded`, whose copy and reset control already say the right
 * thing; the test that pins it is beside the one above.
 *
 * It does not bound the whole generation. Documents arrive mid-loop as tool
 * results, and KNOWLEDGE_READ_BUDGET is what caps those.
 */
export const CHAT_MAX_INPUT_TOKENS = 80_000

/**
 * Left low in case a future model honours sampling. Gemini 3.x ignores
 * temperature, top_p, and top_k; thinking level is the correctness lever.
 */
export const CHAT_TEMPERATURE = 0.2

/**
 * Gemini 3.8 Flash thinking levels the chat route will send.
 *
 * `none` is not on this list: the AI SDK clamps it to the model's floor
 * (`low` here), which is the latency setting, not the correctness one.
 * Google's default and recommendation for agentic first-pass accuracy is
 * `medium`. `CHAT_REASONING` overrides for eval comparison runs.
 */
export const CHAT_REASONING_LEVELS = ['low', 'medium', 'high'] as const
export type ChatReasoning = (typeof CHAT_REASONING_LEVELS)[number]
export const DEFAULT_CHAT_REASONING: ChatReasoning = 'medium'

export function chatReasoning(source: EnvSource = process.env): ChatReasoning {
  const value = source.CHAT_REASONING
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return DEFAULT_CHAT_REASONING
}

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
  | 'blocked'
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
  // BotID classified the request as automated (MTC-34). 403, not 429: it
  // is not a limit the same caller can wait out.
  blocked: 403,
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
  blocked:
    "That request looked automated, so the assistant didn't answer it. If you're a person, reload the page and try again, or email Matt at matt.trifilo@gmail.com.",
  too_many_turns: `This conversation has reached its limit of ${CHAT_MAX_TURNS} questions. Start a new one to keep going, or email Matt at matt.trifilo@gmail.com.`,
  message_too_long: `That question is longer than ${CHAT_MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters. Trim it a little and send it again.`,
  budget_exceeded:
    'This conversation has grown too long for the assistant to hold in mind. Start a new one and it will pick up fresh.',
  invalid:
    "That request wasn't something the assistant could read. Try again, or start a new conversation.",
  unavailable:
    "The assistant couldn't reach its model just now. Try again in a moment, or email Matt at matt.trifilo@gmail.com.",
  interrupted:
    'The assistant lost its connection part-way through that answer. Ask again, or email Matt at matt.trifilo@gmail.com.',
}

export type ChatRequestValidation =
  | { ok: true; history: ChatTurn[]; userMessage: string }
  | { ok: false; status: number; body: ChatErrorBody }

// Defined in its own module so pages can read it without this file's
// knowledge-index import; re-exported so the route keeps one import.
export { isChatDisabled }

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
  // The fixed blocks the route always sends, plus the conversation.
  // REPOSITORY_BLOCK rides in the same system message as the index but is not
  // part of its token estimate, so it is counted here rather than left out.
  //
  // What is still not counted: the two tool definitions, which the SDK sends
  // on every model call. They are a few hundred tokens, and
  // `recent_activity`'s description interpolates the allowlist, so they grow
  // when a repository is added. That is a knowing omission rather than an
  // oversight, and it is why CHAT_MAX_INPUT_TOKENS is set below the sum of
  // the caps rather than at it; if the allowlist ever grows past a handful,
  // count them here instead of widening the margin again.
  const inputTokens =
    indexTokenEstimate +
    estimateTokens(SYSTEM_PROMPT) +
    estimateTokens(REPOSITORY_BLOCK) +
    conversationTokens
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
    let dataParts = 0
    for (const part of message.parts) {
      if (!isRecord(part)) return null
      // The AI SDK marks each model step in a replayed assistant message
      // with a `step-start` part. It carries nothing, so skipping it cannot
      // change what the model is asked; refusing it broke every second turn
      // on the first UI preview.
      if (part.type === 'step-start') continue
      // The one data part this route writes, replayed with the answer in
      // exactly the same way `step-start` is: it carries the step list the
      // visitor watched, which is this route's own narration and nothing the
      // model needs. Refusing it would break every second turn, the same bug
      // the `step-start` line above fixes.
      //
      // Matched exactly, and only once per message, rather than by a `data-`
      // prefix. A prefix would let a tampered body carry unbounded `data-*`
      // payloads that no limit below counts, since every cap here measures
      // concatenated text: the request would reach the model and be billed
      // where it used to be refused for free.
      //
      // Its size is deliberately not measured. The largest part the route
      // can write, every field at its cap, is 6,383 characters of JSON, and
      // a longest conversation carrying one on every answer is about 326 KB
      // against the 4.5 MB request body Vercel accepts. validate.test.ts
      // pins the first and bounds the second, so a cap change reopens this.
      // A byte budget here would have to be exactly right or refuse a real
      // visitor's next question, and it would buy nothing against a
      // tampered body: the body is parsed whole before this runs, and the
      // part is discarded unread like any other field the route ignores.
      // The runbook's progress section has the measurements.
      if (part.type === PROGRESS_PART_TYPE) {
        if (dataParts > 0) return null
        dataParts += 1
        continue
      }
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
