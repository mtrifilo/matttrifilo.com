import { describe, expect, test } from 'bun:test'
import type { Tool } from 'ai'
import {
  KNOWLEDGE_READ_BUDGET,
  loadKnowledgeIndex,
  type KnowledgeDocument,
} from '@/lib/knowledge'
import { ACTIVITY_MAX_TOKENS } from './github-activity'
import { createReadBudget } from './read-budget'
import { createReadDocumentSession } from './read-document'
import {
  RECENT_ACTIVITY_MAX_CALLS,
  createRecentActivitySession,
} from './recent-activity'
import { ASSISTANT_REPOSITORIES } from './repositories'
import { CHAT_MAX_INPUT_TOKENS, estimateTokens } from './validate'

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

describe('each model call is held to the input cap (MTC-107)', () => {
  // The next call re-sends its input before tools plus everything charged
  // so far, so a charge is refused once that sum would pass the cap.
  const nearTheCap = CHAT_MAX_INPUT_TOKENS - 1_000

  test('a charge that would carry the next call past the cap is refused', () => {
    const budget = createReadBudget(
      KNOWLEDGE_READ_BUDGET.maxTokens,
      () => nearTheCap
    )
    // Well inside the read budget, so only the per-call bound refuses it.
    expect(budget.charge(1_001)).toBe(false)
    expect(budget.spent()).toBe(0)
  })

  test('a charge that brings the next call exactly to the cap fits', () => {
    const budget = createReadBudget(
      KNOWLEDGE_READ_BUDGET.maxTokens,
      () => nearTheCap
    )
    expect(budget.charge(600)).toBe(true)
    expect(budget.charge(400)).toBe(true)
    expect(budget.spent()).toBe(1_000)
    expect(budget.charge(1)).toBe(false)
  })

  test('a refusal there is not a closed ledger either', () => {
    const budget = createReadBudget(
      KNOWLEDGE_READ_BUDGET.maxTokens,
      () => nearTheCap
    )
    expect(budget.charge(5_000)).toBe(false)
    expect(budget.charge(500)).toBe(true)
    expect(budget.spent()).toBe(500)
  })

  test('the input before tools is asked for at each charge, not when the budget is built', () => {
    // The handler measures the tool definitions after the tools are built
    // over this budget, so the figure has to be read late.
    let before = Number.POSITIVE_INFINITY
    const budget = createReadBudget(
      KNOWLEDGE_READ_BUDGET.maxTokens,
      () => before
    )
    expect(budget.charge(1)).toBe(false)
    before = 0
    expect(budget.charge(1)).toBe(true)
  })

  test('carried text counts for the next call but not against the read budget', () => {
    const budget = createReadBudget(
      KNOWLEDGE_READ_BUDGET.maxTokens,
      () => nearTheCap
    )
    budget.carry(600)
    expect(budget.spent()).toBe(0)
    expect(budget.charge(401)).toBe(false)
    expect(budget.charge(400)).toBe(true)
  })

  test('with no input before tools the read budget alone decides', () => {
    const budget = createReadBudget()
    expect(budget.charge(KNOWLEDGE_READ_BUDGET.maxTokens)).toBe(true)
  })
})

describe('what the shared ceiling actually allows', () => {
  test('the worst read and a full set of digests do not both fit', () => {
    // Measured rather than asserted as a guarantee, because it is not one.
    // Before MTC-45 the corpus guard in lib/knowledge/knowledge.test.ts
    // ("the three largest documents fit in one turn") meant the token budget
    // could not refuse a read that the progress view had already announced.
    // Sharing the budget with the GitHub digests ends that: three digests at
    // their cap plus the worst repeated read is over 20,000.
    //
    // That is a deliberate trade, not an oversight. The alternative is a
    // second ceiling per tool, which makes the real limit the sum of the
    // tools rather than the number written down. What makes it safe is that
    // a refused read is now withdrawn from the narration rather than
    // predicted (withProgress in lib/chat/handler.ts), so the visitor is
    // never told about a document the answer did not use.
    //
    // If this ever needs to stop being true, raising KNOWLEDGE_READ_BUDGET
    // .maxTokens is the lever, and this test is where the arithmetic is.
    const sorted = [...loadKnowledgeIndex().entries].sort(
      (a, b) => b.tokenEstimate - a.tokenEstimate
    )
    const worstRepeatedRead =
      sorted[0].tokenEstimate * 2 + (sorted[1]?.tokenEstimate ?? 0)
    const digests = RECENT_ACTIVITY_MAX_CALLS * ACTIVITY_MAX_TOKENS

    expect(worstRepeatedRead).toBeLessThanOrEqual(
      KNOWLEDGE_READ_BUDGET.maxTokens
    )
    expect(worstRepeatedRead + digests).toBeGreaterThan(
      KNOWLEDGE_READ_BUDGET.maxTokens
    )
  })

  test('an ordinary question still has room for both', () => {
    // The case that matters in practice: the three largest documents read
    // once each, plus one repository checked, which is what an activity
    // question actually does.
    const sorted = [...loadKnowledgeIndex().entries].sort(
      (a, b) => b.tokenEstimate - a.tokenEstimate
    )
    const threeLargest = sorted
      .slice(0, KNOWLEDGE_READ_BUDGET.maxDocuments)
      .reduce((total, entry) => total + entry.tokenEstimate, 0)

    expect(threeLargest + ACTIVITY_MAX_TOKENS).toBeLessThanOrEqual(
      KNOWLEDGE_READ_BUDGET.maxTokens
    )
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

  test('a digest handed to a repeated check is carried for the next call', async () => {
    // Two checks of one repository in one step share a fetch and are charged
    // once, but the model is handed the digest twice, and the next call
    // carries both copies. A read that fits beside one copy and not beside
    // two is refused.
    const raw = {
      pushedAt: '2026-09-20T11:00:00Z',
      release: null,
      pullRequests: [{ title: 'Ship it', mergedAt: '2026-09-18T10:00:00Z' }],
      commits: [],
    }
    let room = 100_000
    const budget = createReadBudget(
      KNOWLEDGE_READ_BUDGET.maxTokens,
      () => CHAT_MAX_INPUT_TOKENS - room
    )
    const checking = createRecentActivitySession({
      budget,
      fetchActivity: async () => ({ kind: 'ok', raw }),
    })
    const repository = ASSISTANT_REPOSITORIES[0].id

    const [first, second] = await Promise.all([
      call(checking.tool, { repository }),
      call(checking.tool, { repository }),
    ])
    expect(first).toEqual(second)
    const digestTokens = checking.activityTokens()
    expect(budget.spent()).toBe(digestTokens)

    // Room for one copy of the digest and the document, not for two copies.
    room = digestTokens * 2 + estimateTokens(document.text) - 1
    const reading = createReadDocumentSession({
      entries: [entry],
      readKnowledgeDocument: () => document,
      budget,
    })
    expect(await call(reading.tool, { id: 'resume' })).toEqual({
      error: 'read_budget_exhausted',
    })
  })

  test('both tools refuse at the per-call bound in the words of an exhausted budget', async () => {
    // A conversation so long that nothing more fits in the next call: each
    // tool answers as it does when the budget is spent, and counts it the
    // same way, so the model and the log line cannot tell the two apart.
    const budget = createReadBudget(
      KNOWLEDGE_READ_BUDGET.maxTokens,
      () => CHAT_MAX_INPUT_TOKENS
    )
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
          pushedAt: null,
          release: null,
          pullRequests: [],
          commits: [],
        },
      }),
    })

    expect(await call(reading.tool, { id: 'resume' })).toEqual({
      error: 'read_budget_exhausted',
    })
    expect(
      await call(checking.tool, { repository: ASSISTANT_REPOSITORIES[0].id })
    ).toEqual({ error: 'activity_budget_exhausted' })
    expect(reading.readsRefused()).toEqual({
      unknown: 0,
      budget: 1,
      tooLarge: 0,
    })
    expect(checking.activityRefused()).toMatchObject({ budget: 1 })
    expect(budget.spent()).toBe(0)
  })
})
