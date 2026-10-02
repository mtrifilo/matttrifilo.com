import { asSchema, type Tool } from 'ai'
import type { ChatModelMessage } from './prompt'
import { estimateTokens } from './validate'

/**
 * What a model call in one request sends before any tool has added text to
 * it, by the same estimate validate.ts budgets the conversation with
 * (MTC-107).
 *
 * validateChatRequest compares the posted conversation with
 * CHAT_MAX_INPUT_TOKENS once, before the first call. Every later call
 * re-sends that conversation plus every document and digest the tools have
 * returned, so the read budget (lib/chat/read-budget.ts) adds this figure to
 * what it has charged and refuses a charge that would carry the next call
 * past the same cap.
 *
 * Counted here, unlike at the door: the frame around the index and the
 * transcript's heading and labels, because this sums the messages exactly as
 * buildMessages renders them, and the tool definitions. The last call is
 * offered no tools, so on that call the definitions are counted but not sent;
 * the error is a few hundred tokens on the cautious side.
 *
 * Not counted: what the model itself wrote in earlier steps (its tool calls
 * and any text before them), which re-sent calls also carry, and the JSON
 * around each tool result. In two measured full runs (MTC-107, 2026-09-30)
 * they added a few hundred tokens a step, while Vertex counted large
 * documents 10 to 18 percent below their estimate. In principle a step's
 * text can reach CHAT_MAX_OUTPUT_TOKENS, so this bounds what the tools add,
 * not every token a call can carry.
 */
export function estimateCallInputTokens(
  messages: readonly ChatModelMessage[],
  tools: Readonly<Record<string, Tool>>
): number {
  const messageTokens = messages.reduce(
    (total, message) => total + estimateTokens(message.content),
    0
  )
  return messageTokens + estimateToolDefinitionTokens(tools)
}

/**
 * Each tool as a function declaration carries it: its name, its description
 * and its input schema, measured as one JSON object. The provider sends the
 * schema in Vertex's own dialect rather than this one, so this is an
 * estimate like the rest, not the provider's byte count.
 */
export function estimateToolDefinitionTokens(
  tools: Readonly<Record<string, Tool>>
): number {
  let total = 0
  for (const [name, tool] of Object.entries(tools)) {
    const parameters = asSchema(tool.inputSchema).jsonSchema
    // Every schema this route declares is a plain object. One that resolves
    // later cannot be measured before the call, and an unmeasured definition
    // is exactly the quiet growth the cap exists to catch.
    if (isPromiseLike(parameters)) {
      throw new Error(`tool ${name} has a schema that cannot be measured`)
    }
    total += estimateTokens(
      JSON.stringify({ name, description: tool.description, parameters })
    )
  }
  return total
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}
