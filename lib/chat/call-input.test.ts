import { describe, expect, test } from 'bun:test'
import { jsonSchema, tool } from 'ai'
import { loadKnowledgeIndex } from '@/lib/knowledge'
import {
  estimateCallInputTokens,
  estimateToolDefinitionTokens,
} from './call-input'
import { REPOSITORY_BLOCK, SYSTEM_PROMPT, buildMessages } from './prompt'
import { createReadDocumentSession } from './read-document'
import { createRecentActivitySession } from './recent-activity'
import { estimateTokens } from './validate'

/** The two tools the route offers, built as the handler builds them. */
function routeTools() {
  const index = loadKnowledgeIndex()
  return {
    read_document: createReadDocumentSession({
      entries: index.entries,
      readKnowledgeDocument: () => undefined,
    }).tool,
    recent_activity: createRecentActivitySession({
      fetchActivity: async () => ({ kind: 'unavailable' }) as never,
    }).tool,
  }
}

describe('estimateToolDefinitionTokens', () => {
  test('measures the name, the description and the schema of each tool', () => {
    const described = tool({
      description: 'd'.repeat(400),
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
      execute: async () => ({}),
    })
    const tokens = estimateToolDefinitionTokens({ some_tool: described })
    expect(tokens).toBe(
      estimateTokens(
        JSON.stringify({
          name: 'some_tool',
          description: 'd'.repeat(400),
          parameters: { type: 'object', properties: {} },
        })
      )
    )
    expect(tokens).toBeGreaterThan(100)
  })

  test('the route tools come to a few hundred tokens, and grow with their text', () => {
    // The runbook's "Cost of a run" puts the two definitions at ~388 by an
    // estimate that leaves out the names and the JSON around them; this one
    // counts them, so it reads a little higher.
    const tokens = estimateToolDefinitionTokens(routeTools())
    expect(tokens).toBeGreaterThan(300)
    expect(tokens).toBeLessThan(1_000)
  })

  test('a schema that resolves later is refused rather than counted as nothing', () => {
    const deferred = tool({
      description: 'later',
      inputSchema: jsonSchema(
        Promise.resolve({ type: 'object' as const, properties: {} })
      ),
      execute: async () => ({}),
    })
    expect(() => estimateToolDefinitionTokens({ deferred })).toThrow(
      'tool deferred has a schema that cannot be measured'
    )
  })
})

describe('estimateCallInputTokens', () => {
  test('is the messages as sent plus the tool definitions', () => {
    const index = loadKnowledgeIndex()
    const messages = buildMessages({
      index,
      history: [{ role: 'user', text: 'An earlier question?' }],
      userMessage: 'What did Matt build at Thryv?',
    })
    const tools = routeTools()

    expect(estimateCallInputTokens(messages, tools)).toBe(
      messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) +
        estimateToolDefinitionTokens(tools)
    )
  })

  test('counts more than the door does for the same conversation', () => {
    // validate.ts counts the policy, the index text, the repository list and
    // the raw turns. A call also carries the index frame, the transcript's
    // heading and labels, and the tool definitions, and this counts those.
    const index = loadKnowledgeIndex()
    const history = [
      { role: 'user' as const, text: 'An earlier question?' },
      { role: 'assistant' as const, text: 'An earlier answer.' },
    ]
    const question = 'What did Matt build at Thryv?'
    const door =
      index.tokenEstimate +
      estimateTokens(SYSTEM_PROMPT) +
      estimateTokens(REPOSITORY_BLOCK) +
      [...history.map(turn => turn.text), question].reduce(
        (sum, text) => sum + estimateTokens(text),
        0
      )
    const call = estimateCallInputTokens(
      buildMessages({ index, history, userMessage: question }),
      routeTools()
    )

    expect(call).toBeGreaterThan(door)
    expect(call - door).toBeGreaterThan(
      estimateToolDefinitionTokens(routeTools())
    )
  })
})
