import { KNOWLEDGE_READ_BUDGET } from '@/lib/knowledge'
import { CHAT_MAX_INPUT_TOKENS } from './validate'

/**
 * One request's token ledger, shared by every tool that puts text into the
 * conversation (MTC-45).
 *
 * KNOWLEDGE_READ_BUDGET is a bound on what one question may send, not a bound
 * on documents in particular. Once a second tool could add text of its own, a
 * per-tool counter would mean the real ceiling was the sum of the tools
 * rather than the number written down, and it would grow again with the next
 * tool. So the ceiling lives here and the tools charge against it.
 *
 * It also keeps what the tools add from carrying a model call past
 * CHAT_MAX_INPUT_TOKENS (MTC-107). Every call after the first re-sends the
 * conversation plus everything the tools have returned so far, so a charge is
 * refused when it would carry the next call past the cap, even with room left
 * in the read budget. The refusal is the same `false` a full budget returns,
 * so each tool turns it away in the words it already uses for an exhausted
 * budget, and the model, the log and the eval ledger cannot tell the two
 * apart. It bounds tool text only: the conversation itself was admitted at
 * the door, and what the model wrote in earlier steps is not counted
 * (lib/chat/call-input.ts says what is). A carried copy (below) is counted
 * for every later charge but is never itself refused.
 *
 * Per request, like the sessions that hold it: a ledger built at module scope
 * would let one visitor's reads exhaust another's.
 */
export interface ReadBudget {
  /**
   * Charges `tokens` if they fit, and reports whether they did. Nothing is
   * charged on a refusal, so a caller may offer a large item, be refused, and
   * offer a smaller one.
   */
  charge(tokens: number): boolean
  /** Tokens charged so far, by every tool together. */
  spent(): number
  /**
   * Records text a tool hands the model again without charging it: a GitHub
   * digest delivered to a repeated call in the same step. The read budget
   * ignores it, as it always has; the per-call bound counts it, because the
   * next call carries every copy.
   */
  carry(tokens: number): void
  /** The ceiling, so a caller can tell "too big to ever fit" from "no room left". */
  readonly maxTokens: number
}

/**
 * `callInputTokens` is the estimated input of a model call in this request
 * before any tool text (estimateCallInputTokens in lib/chat/call-input.ts).
 * It is asked for when a charge is offered rather than taken as a number
 * because the handler can only measure the tool definitions once the tools
 * exist, and the tools are built over this budget. Omitted, it is zero,
 * which is what a test about the read budget alone wants: the read budget
 * is far below the cap, so the per-call bound never binds.
 */
export function createReadBudget(
  maxTokens: number = KNOWLEDGE_READ_BUDGET.maxTokens,
  callInputTokens: () => number = () => 0
): ReadBudget {
  let spent = 0
  let carried = 0
  return {
    charge(tokens: number): boolean {
      if (spent + tokens > maxTokens) return false
      const nextCall = callInputTokens() + spent + carried + tokens
      if (nextCall > CHAT_MAX_INPUT_TOKENS) return false
      spent += tokens
      return true
    },
    spent: () => spent,
    carry(tokens: number): void {
      carried += tokens
    },
    maxTokens,
  }
}
