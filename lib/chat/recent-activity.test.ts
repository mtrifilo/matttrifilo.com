import { describe, expect, test } from 'bun:test'
import type { Tool } from 'ai'
import {
  ACTIVITY_BLOCK_START,
  type ActivityFetchResult,
} from './github-activity'
import { createReadBudget } from './read-budget'
import {
  RECENT_ACTIVITY_INPUT_SCHEMA,
  RECENT_ACTIVITY_MAX_CALLS,
  createRecentActivitySession,
  type RecentActivityResult,
} from './recent-activity'
import { ASSISTANT_REPOSITORIES } from './repositories'

/**
 * The guards between a model's request and a third party (MTC-45): what is
 * refused, what is fetched at most once, and what the digest costs.
 */

const ALLOWED = ASSISTANT_REPOSITORIES[0].id

const raw = {
  pushedAt: '2026-09-20T11:00:00Z',
  release: null,
  pullRequests: [
    { title: 'Ship the parser', mergedAt: '2026-09-18T10:00:00Z' },
  ],
  commits: [{ subject: 'Fix a crash', date: '2026-09-20T10:00:00Z' }],
}

/** A fetch that always answers, and counts how often it was asked. */
function fetcher(result: ActivityFetchResult = { kind: 'ok', raw }): {
  calls: string[]
  fetchActivity: (repository: { id: string }) => Promise<ActivityFetchResult>
} {
  const calls: string[] = []
  return {
    calls,
    fetchActivity: async repository => {
      calls.push(repository.id)
      return result
    },
  }
}

/** The tool's execute, typed the way the session hands it over. */
const run = (tool: Tool, repository: unknown) =>
  (
    tool.execute as unknown as (input: {
      repository: unknown
    }) => Promise<RecentActivityResult>
  )({ repository })

describe('the input schema', () => {
  test('accepts an object with a string repository', () => {
    expect(
      RECENT_ACTIVITY_INPUT_SCHEMA.validate?.({ repository: 'decant' })
    ).toEqual({ success: true, value: { repository: 'decant' } })
  })

  test.each([
    ['a bare string', 'decant'],
    ['an array', ['decant']],
    ['null', null],
    ['a number where the id goes', { repository: 7 }],
    ['nothing at all', {}],
  ])('refuses %s at runtime, not only in the types', (_label, value) => {
    expect(RECENT_ACTIVITY_INPUT_SCHEMA.validate?.(value)).toMatchObject({
      success: false,
    })
  })
})

describe('the allowlist guard', () => {
  test('an allowlisted id comes back as a framed block', async () => {
    const { fetchActivity, calls } = fetcher()
    const session = createRecentActivitySession({ fetchActivity })
    const result = await run(session.tool, ALLOWED)
    expect(result).toMatchObject({ repository: ALLOWED })
    expect('activity' in result && result.activity).toContain(
      ACTIVITY_BLOCK_START
    )
    expect(calls).toEqual([ALLOWED])
  })

  test.each([
    ['another repository of Matt', 'some-other-repo'],
    ['an owner/name slug', 'mtrifilo/decant'],
    ['a URL', 'https://api.github.com/repos/mtrifilo/decant'],
    ['a traversal', '../../../etc/passwd'],
    ['empty', ''],
  ])('%s is refused and reaches no network', async (_label, id) => {
    const { fetchActivity, calls } = fetcher()
    const session = createRecentActivitySession({ fetchActivity })
    expect(await run(session.tool, id)).toEqual({
      error: 'unknown_repository',
    })
    // The guarantee that matters: not one request was made for it.
    expect(calls).toEqual([])
    expect(session.activityCalls()).toBe(0)
  })
})

describe('the call caps', () => {
  test('a repository is fetched at most once per request', async () => {
    const { fetchActivity, calls } = fetcher()
    const session = createRecentActivitySession({ fetchActivity })
    await run(session.tool, ALLOWED)
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'repository_already_checked',
    })
    expect(calls).toEqual([ALLOWED])
  })

  test('at most RECENT_ACTIVITY_MAX_CALLS fetches in one request', async () => {
    const { fetchActivity, calls } = fetcher()
    const session = createRecentActivitySession({ fetchActivity })
    for (const repository of ASSISTANT_REPOSITORIES) {
      await run(session.tool, repository.id)
    }
    expect(calls).toHaveLength(RECENT_ACTIVITY_MAX_CALLS)
    expect(session.activityCalls()).toBe(RECENT_ACTIVITY_MAX_CALLS)

    // The cap itself, not the size of the allowlist. Today the two agree, so
    // without this line deleting the cap leaves every assertion above green;
    // the cap exists for the day the list is longer than it.
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'activity_budget_exhausted',
    })
    expect(calls).toHaveLength(RECENT_ACTIVITY_MAX_CALLS)
  })

  test('the counters split the refusals by reason', async () => {
    const { fetchActivity } = fetcher()
    const session = createRecentActivitySession({ fetchActivity })
    await run(session.tool, 'not-on-the-list')
    await run(session.tool, ALLOWED)
    await run(session.tool, ALLOWED)
    expect(session.activityRefused()).toEqual({
      unknown: 1,
      duplicate: 1,
      budget: 0,
    })
  })

  test('a repository GitHub cannot answer for costs one attempt, not many', async () => {
    // Without this a model retrying a 503 would spend the visitor's whole
    // question on an outage. It is told the same refusal again, and NOT
    // `repository_already_checked`, which would send it looking for activity
    // it was never given and is the shape an invented summary starts in.
    const { fetchActivity, calls } = fetcher({ kind: 'unavailable' })
    const session = createRecentActivitySession({ fetchActivity })
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'activity_unavailable',
    })
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'activity_unavailable',
    })
    expect(calls).toEqual([ALLOWED])
  })

  test('two calls for one repository in the same step get the same answer', async () => {
    // The SDK runs a step's tool calls concurrently, and models do emit
    // duplicates. The second call awaits the first's promise, so one step
    // carries one outcome for one repository: it cannot hold a digest and
    // `repository_already_checked` at once, and it cannot hold a digest and a
    // failure at once either (MTC-52).
    let calls = 0
    const session = createRecentActivitySession({
      fetchActivity: async () => {
        calls += 1
        await new Promise(resolve => setTimeout(resolve, 20))
        return { kind: 'ok', raw }
      },
    })

    const [first, second] = await Promise.all([
      run(session.tool, ALLOWED),
      run(session.tool, ALLOWED),
    ])

    expect(calls).toBe(1)
    expect(first).toMatchObject({ repository: ALLOWED })
    expect(second).toEqual(first)
    // The digest is charged once, not once per caller.
    expect(session.activityCalls()).toBe(1)
    // Still counted: what the counter is read for is a model looping, which
    // is what this is whether the second call was refused or coalesced.
    expect(session.activityRefused().duplicate).toBe(1)
  })

  test('a concurrent duplicate shares the failure rather than contradicting it', async () => {
    let calls = 0
    const session = createRecentActivitySession({
      fetchActivity: async () => {
        calls += 1
        await new Promise(resolve => setTimeout(resolve, 20))
        return { kind: 'unavailable' }
      },
    })

    const results = await Promise.all([
      run(session.tool, ALLOWED),
      run(session.tool, ALLOWED),
    ])

    expect(calls).toBe(1)
    expect(results).toEqual([
      { error: 'activity_unavailable' },
      { error: 'activity_unavailable' },
    ])
  })

  test('a concurrent duplicate charges the read budget once', async () => {
    // Measured against a session that did not duplicate, rather than against
    // this session's own counter: both counters move on adjacent lines, so
    // comparing them to each other would pass however often either was
    // charged.
    const alone = createReadBudget()
    const single = createRecentActivitySession({
      budget: alone,
      ...fetcher(),
    })
    await run(single.tool, ALLOWED)

    const budget = createReadBudget()
    let calls = 0
    const session = createRecentActivitySession({
      budget,
      fetchActivity: async () => {
        calls += 1
        await new Promise(resolve => setTimeout(resolve, 20))
        return { kind: 'ok', raw }
      },
    })

    await Promise.all([run(session.tool, ALLOWED), run(session.tool, ALLOWED)])

    expect(calls).toBe(1)
    expect(budget.spent()).toBe(alone.spent())
    expect(budget.spent()).toBeGreaterThan(0)
  })

  test('a duplicate is coalesced even when the call cap is already spent', async () => {
    // The allowlist is exactly RECENT_ACTIVITY_MAX_CALLS long, so a step that
    // checks every repository and repeats one reaches the repeat with the cap
    // spent. Behind the cap check the repeat was told the budget was
    // exhausted while the first call was being handed that repository's
    // digest, which is the contradiction the coalescing removes.
    const fetched: string[] = []
    const session = createRecentActivitySession({
      fetchActivity: async repository => {
        fetched.push(repository.id)
        await new Promise(resolve => setTimeout(resolve, 20))
        return { kind: 'ok', raw }
      },
    })

    const results = await Promise.all([
      ...ASSISTANT_REPOSITORIES.map(repository =>
        run(session.tool, repository.id)
      ),
      run(session.tool, ALLOWED),
    ])

    expect(fetched).toHaveLength(RECENT_ACTIVITY_MAX_CALLS)
    expect(results[results.length - 1]).toEqual(results[0])
    expect(session.activityRefused()).toEqual({
      unknown: 0,
      duplicate: 1,
      budget: 0,
    })
  })

  test('a call after the in-flight one has settled is told it already has it', async () => {
    // The coalescing is for one step, not for the request: once the promise
    // has settled the recorded outcome is what answers, as before.
    const { fetchActivity, calls } = fetcher()
    const session = createRecentActivitySession({ fetchActivity })
    await Promise.all([run(session.tool, ALLOWED), run(session.tool, ALLOWED)])
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'repository_already_checked',
    })
    expect(calls).toEqual([ALLOWED])
  })

  test('a repository whose digest did not fit is told that again', async () => {
    const budget = createReadBudget(10)
    const { fetchActivity } = fetcher()
    const session = createRecentActivitySession({ fetchActivity, budget })
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'activity_budget_exhausted',
    })
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'activity_budget_exhausted',
    })
  })

  test('a repository that did answer is told it already has it', async () => {
    const { fetchActivity } = fetcher()
    const session = createRecentActivitySession({ fetchActivity })
    await run(session.tool, ALLOWED)
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'repository_already_checked',
    })
  })

  test('a missing repository is unavailable to the model, not a throw', async () => {
    const { fetchActivity } = fetcher({ kind: 'missing' })
    const session = createRecentActivitySession({ fetchActivity })
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'activity_unavailable',
    })
  })
})

describe('the shared read budget', () => {
  test('a digest is charged to the same ledger the documents spend', async () => {
    const budget = createReadBudget()
    const { fetchActivity } = fetcher()
    const session = createRecentActivitySession({ fetchActivity, budget })
    await run(session.tool, ALLOWED)
    expect(session.activityTokens()).toBeGreaterThan(0)
    expect(budget.spent()).toBe(session.activityTokens())
  })

  test('a digest that will not fit is refused and charges nothing', async () => {
    // A budget a document has already all but spent: the digest is refused
    // rather than sent, and the ledger is untouched.
    const budget = createReadBudget(10)
    const { fetchActivity } = fetcher()
    const session = createRecentActivitySession({ fetchActivity, budget })
    expect(await run(session.tool, ALLOWED)).toEqual({
      error: 'activity_budget_exhausted',
    })
    expect(budget.spent()).toBe(0)
    expect(session.activityTokens()).toBe(0)
  })
})

describe('failure reporting', () => {
  test('the fetcher is handed the sink the handler logs through', async () => {
    let handed: unknown = 'not handed'
    const session = createRecentActivitySession({
      fetchActivity: async (_repository, onFailure) => {
        handed = onFailure
        return { kind: 'unavailable' }
      },
      onFailure: () => {},
    })
    await run(session.tool, ALLOWED)
    expect(typeof handed).toBe('function')
  })
})
