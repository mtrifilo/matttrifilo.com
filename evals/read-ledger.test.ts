import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { createChatHandler } from '@/lib/chat/handler'
import { READ_DOCUMENT_TOOL_NAME } from '@/lib/chat/prompt'
import type { ProgressView } from '@/lib/chat/progress'
import { ASSISTANT_REPOSITORIES } from '@/lib/chat/repositories'
import {
  KNOWLEDGE_READ_BUDGET,
  loadKnowledgeIndex,
  type KnowledgeDocument,
  type KnowledgeEntry,
  type KnowledgeIndex,
} from '@/lib/knowledge'
import { createReadLedger, splitReadLedger } from './read-ledger'
import { chatRequest } from './route-request'
import { parseUiMessageStream } from './route-stream'

/** A final progress part holding the given steps. */
function progressOf(...steps: ProgressView['steps']): ProgressView {
  return { phase: 'done', steps }
}

describe('splitReadLedger', () => {
  test('one completed read and one refused read land in separate lists', () => {
    // The store resolved both; the route's final account lists only the
    // first, because the second was refused after it was found.
    expect(
      splitReadLedger(
        ['resume', 'technical-expertise'],
        progressOf({ id: 'resume', title: 'Résumé', topic: 'resume' })
      )
    ).toEqual({ readIds: ['resume'], refusedIds: ['technical-expertise'] })
  })

  test('each id appears once, in the order it was first resolved', () => {
    expect(
      splitReadLedger(
        ['faq', 'resume', 'faq', 'open-source', 'resume'],
        progressOf(
          { id: 'resume', title: 'Résumé' },
          { id: 'faq', title: 'FAQ' }
        )
      )
    ).toEqual({ readIds: ['faq', 'resume'], refusedIds: ['open-source'] })
  })

  test('a GitHub check that shares an id with a document is not a read', () => {
    expect(
      splitReadLedger(
        ['open-source'],
        progressOf({
          id: 'open-source',
          title: 'open-source',
          kind: 'activity',
        })
      )
    ).toEqual({ readIds: [], refusedIds: ['open-source'] })
  })

  test('a step with no kind is a document, as the browser reads it', () => {
    expect(
      splitReadLedger(['resume'], progressOf({ id: 'resume', title: 'Résumé' }))
    ).toEqual({ readIds: ['resume'], refusedIds: [] })
  })

  test('with no progress part, nothing counts as read, and says why', () => {
    // The safe direction: a run that proves no read reddens a read
    // assertion rather than passing one on a document it may not have seen.
    // The flag keeps a red row from blaming a refusal.
    expect(splitReadLedger(['resume'], undefined)).toEqual({
      readIds: [],
      refusedIds: ['resume'],
      readsUnproven: true,
    })
    expect(splitReadLedger([], undefined)).toEqual({
      readIds: [],
      refusedIds: [],
    })
  })

  test('a progress part with no steps proves the reads were refused', () => {
    expect(splitReadLedger(['resume'], progressOf())).toEqual({
      readIds: [],
      refusedIds: ['resume'],
    })
  })

  test('a step the store never resolved is not a read', () => {
    expect(
      splitReadLedger([], progressOf({ id: 'resume', title: 'Résumé' }))
    ).toEqual({ readIds: [], refusedIds: [] })
  })
})

/*
 * The split against the route itself: the real handler, a scripted model,
 * and the provider's own wrapper and parser. What this proves is that the
 * progress part the provider reads withdraws exactly the reads the tool
 * refused after the store had resolved them, for both refusals that happen
 * there: a document larger than the whole budget, and one that does not fit
 * what is left of it.
 */

const TOKENS_PER_CHAR = 4

function document(id: string, tokens: number): KnowledgeDocument {
  return {
    id,
    title: `Document ${id}`,
    summary: `The ${id} document.`,
    tags: [],
    topic: 'career',
    source: 'career',
    tokenEstimate: tokens,
    text: 'x'.repeat(tokens * TOKENS_PER_CHAR),
    updated: '2026-09-01',
  }
}

const half = Math.floor(KNOWLEDGE_READ_BUDGET.maxTokens / 2)
const store: KnowledgeDocument[] = [
  document('small', 100),
  document('huge', KNOWLEDGE_READ_BUDGET.maxTokens + 1),
  document('first-large', half + 1),
  document('second-large', half + 1),
]

const entries: KnowledgeEntry[] = store.map(({ text, updated, ...entry }) => {
  void text
  void updated
  return entry
})

const index: KnowledgeIndex = {
  entries,
  text: entries.map(entry => `[${entry.id}] ${entry.title}`).join('\n'),
  tokenEstimate: 40,
  builtAt: '2026-09-28T00:00:00.000Z',
}

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
}

function streamOf(parts: unknown[]) {
  return {
    stream: simulateReadableStream({
      chunks: parts as never[],
      chunkDelayInMs: null,
      initialDelayInMs: null,
    }),
  }
}

/**
 * A model that asks for each group of ids in its own step, all of a group at
 * once, then answers.
 */
function modelReadingSteps(...steps: string[][]) {
  let call = 0
  return new MockLanguageModelV4({
    doStream: async () => {
      call += 1
      const ids = steps[call - 1]
      if (ids !== undefined) {
        return streamOf([
          { type: 'stream-start', warnings: [] },
          ...ids.map((id, at) => ({
            type: 'tool-call',
            toolCallId: `call-${call}-${at}-${id}`,
            toolName: READ_DOCUMENT_TOOL_NAME,
            input: JSON.stringify({ id }),
          })),
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'TOOL_CALLS' },
            usage,
          },
        ]) as never
      }
      return streamOf([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'An answer.\n\nSources: small' },
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'STOP' },
          usage,
        },
      ]) as never
    },
  })
}

/** The ledger after one step that asks for every id at once. */
async function ledgerAfter(...ids: string[]) {
  return ledgerAfterSteps(ids)
}

async function ledgerAfterSteps(...steps: string[][]) {
  const ledger = createReadLedger(id => store.find(doc => doc.id === id))
  const handler = createChatHandler({
    loadKnowledgeIndex: () => index,
    readKnowledgeDocument: ledger.readKnowledgeDocument,
    model: () => modelReadingSteps(...steps),
    verifyVisitor: () =>
      Promise.resolve({ isBot: false, isVerifiedBot: false, bypassed: true }),
    env: {},
    now: () => 1_000,
  })
  const response = await handler(chatRequest('What did Matt build?', []))
  return ledger.split(parseUiMessageStream(await response.text()).progress)
}

// The route logs a line per step and per request; this file asserts on
// neither, so they are kept out of the test output.
const realConsole = {
  info: console.info,
  log: console.log,
  warn: console.warn,
}
beforeEach(() => {
  for (const level of ['info', 'log', 'warn'] as const) {
    console[level] = () => {}
  }
})
afterEach(() => {
  Object.assign(console, realConsole)
})

describe('the read ledger, against the route', () => {
  test('a document too large to read is refused, and the other is read', async () => {
    expect(await ledgerAfter('small', 'huge')).toEqual({
      readIds: ['small'],
      refusedIds: ['huge'],
    })
  })

  test('a document that does not fit what is left of the budget is refused', async () => {
    expect(await ledgerAfter('first-large', 'second-large')).toEqual({
      readIds: ['first-large'],
      refusedIds: ['second-large'],
    })
  })

  test('a document read and then refused on a repeat in a later step was read', async () => {
    // The repeat is charged again and no longer fits. Its refusal must not
    // withdraw the row the first read earned, or a correct run goes red.
    expect(await ledgerAfterSteps(['first-large'], ['first-large'])).toEqual({
      readIds: ['first-large'],
      refusedIds: [],
    })
  })

  test('a document read and refused in the same step was read', async () => {
    expect(await ledgerAfter('first-large', 'first-large')).toEqual({
      readIds: ['first-large'],
      refusedIds: [],
    })
  })

  test('a read past the document cap never reaches the store', async () => {
    const past = KNOWLEDGE_READ_BUDGET.maxDocuments + 1
    const ids = Array.from({ length: past }, () => 'small')
    // Repeats of one small document: every call is charged, so the cap is
    // what refuses the last one, before the store is asked.
    expect(await ledgerAfter(...ids)).toEqual({
      readIds: ['small'],
      refusedIds: [],
    })
  })
})

describe('what the split relies on', () => {
  test('no document id is also a repository id', () => {
    // The route's progress stage keys its rows by id alone, so a document
    // sharing an id with a repository checked first would earn no row of
    // its own, and a completed read would land in the refused list.
    const documents = new Set(
      loadKnowledgeIndex().entries.map(entry => entry.id)
    )
    expect(
      ASSISTANT_REPOSITORIES.map(repository => repository.id).filter(id =>
        documents.has(id)
      )
    ).toEqual([])
  })
})
