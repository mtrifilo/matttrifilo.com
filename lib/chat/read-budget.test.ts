import { describe, expect, test } from 'bun:test'
import type { Tool } from 'ai'
import { KNOWLEDGE_READ_BUDGET, type KnowledgeDocument } from '@/lib/knowledge'
import { createReadBudget } from './read-budget'
import { createReadDocumentSession } from './read-document'
import { createRecentActivitySession } from './recent-activity'
import { ASSISTANT_REPOSITORIES } from './repositories'

/**
 * The ceiling on what one question may send is one number, not one per tool
 * (MTC-45).
 */

describe('createReadBudget', () => {
  test('charges what fits and reports it', () => {
    const budget = createReadBudget(100)
    expect(budget.charge(60)).toBe(true)
    expect(budget.spent()).toBe(60)
  })

  test('refuses what does not fit, and charges nothing for it', () => {
    const budget = createReadBudget(100)
    budget.charge(60)
    expect(budget.charge(50)).toBe(false)
    expect(budget.spent()).toBe(60)
    // A smaller offer still goes through: a refusal is not a closed ledger.
    expect(budget.charge(40)).toBe(true)
    expect(budget.spent()).toBe(100)
  })

  test('defaults to the knowledge read budget', () => {
    expect(createReadBudget().maxTokens).toBe(KNOWLEDGE_READ_BUDGET.maxTokens)
  })
})

describe('the two tools share one ledger', () => {
  const document: KnowledgeDocument = {
    id: 'resume',
    title: 'Résumé',
    summary: 'Where Matt has worked.',
    tags: [],
    topic: 'roles',
    source: 'resume',
    tokenEstimate: 10,
    text: 'Matt led the platform migration at Thryv.',
    updated: '2026-09-01',
  }

  const entry = {
    id: document.id,
    title: document.title,
    summary: document.summary,
    tags: document.tags,
    topic: document.topic,
    source: document.source,
    tokenEstimate: document.tokenEstimate,
  }

  const call = (tool: Tool, input: unknown) =>
    (tool.execute as unknown as (value: unknown) => Promise<unknown>)(input)

  test('a read and a check draw down the same number', async () => {
    const budget = createReadBudget()
    const reading = createReadDocumentSession({
      entries: [entry],
      readKnowledgeDocument: () => document,
      budget,
    })
    const checking = createRecentActivitySession({
      budget,
      fetchActivity: async () => ({
        kind: 'ok',
        raw: {
          pushedAt: '2026-09-20T11:00:00Z',
          release: null,
          pullRequests: [
            { title: 'Ship it', mergedAt: '2026-09-18T10:00:00Z' },
          ],
          commits: [],
        },
      }),
    })

    await call(reading.tool, { id: 'resume' })
    await call(checking.tool, { repository: ASSISTANT_REPOSITORIES[0].id })

    // Each session still reports only what it spent, for the log line; the
    // ledger holds the sum, which is what the ceiling is about.
    expect(budget.spent()).toBe(
      reading.readTokens() + checking.activityTokens()
    )
    expect(reading.readTokens()).toBeGreaterThan(0)
    expect(checking.activityTokens()).toBeGreaterThan(0)
  })

  test('a digest that filled the budget leaves no room for a document', async () => {
    const budget = createReadBudget()
    const checking = createRecentActivitySession({
      budget,
      fetchActivity: async () => ({
        kind: 'ok',
        raw: {
          pushedAt: null,
          release: null,
          pullRequests: [],
          commits: [],
        },
      }),
    })
    await call(checking.tool, { repository: ASSISTANT_REPOSITORIES[0].id })
    // Spend the rest by hand, then prove the read tool sees the shared state.
    budget.charge(budget.maxTokens - budget.spent())

    const reading = createReadDocumentSession({
      entries: [entry],
      readKnowledgeDocument: () => document,
      budget,
    })
    expect(await call(reading.tool, { id: 'resume' })).toEqual({
      error: 'read_budget_exhausted',
    })
  })
})
