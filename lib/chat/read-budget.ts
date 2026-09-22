import { KNOWLEDGE_READ_BUDGET } from '@/lib/knowledge'

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
  /** The ceiling, so a caller can tell "too big to ever fit" from "no room left". */
  readonly maxTokens: number
}

export function createReadBudget(
  maxTokens: number = KNOWLEDGE_READ_BUDGET.maxTokens
): ReadBudget {
  let spent = 0
  return {
    charge(tokens: number): boolean {
      if (spent + tokens > maxTokens) return false
      spent += tokens
      return true
    },
    spent: () => spent,
    maxTokens,
  }
}
