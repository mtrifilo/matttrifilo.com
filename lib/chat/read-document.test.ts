import { describe, expect, test } from 'bun:test'
import {
  KNOWLEDGE_READ_BUDGET,
  type KnowledgeDocument,
  type KnowledgeEntry,
} from '@/lib/knowledge'
import { READ_DOCUMENT_TOOL_NAME } from './prompt'
import {
  READ_DOCUMENT_INPUT_SCHEMA,
  createReadDocumentSession,
  type ReadDocumentResult,
} from './read-document'

const entry = (id: string, text: string): KnowledgeEntry => ({
  id,
  title: `Title of ${id}`,
  summary: `Summary of ${id}`,
  tags: [],
  topic: 'roles',
  source: 'resume',
  tokenEstimate: Math.ceil(text.length / 4),
})

const document = (id: string, text: string): KnowledgeDocument => ({
  ...entry(id, text),
  text,
  updated: '2026-09-01',
})

const documents = [
  document('resume', 'Matt led the platform migration at Thryv.'),
  document('faq', 'Matt works on platform teams.'),
  document('projects', 'Matt built a hexagonal renderer.'),
  document('open-source', 'Matt maintains decant.'),
]

const entries: KnowledgeEntry[] = documents.map(doc => entry(doc.id, doc.text))

const store = new Map(documents.map(doc => [doc.id, doc]))

function session(
  overrides: Partial<Parameters<typeof createReadDocumentSession>[0]> = {}
) {
  return createReadDocumentSession({
    entries,
    readKnowledgeDocument: (id: string) => store.get(id),
    ...overrides,
  })
}

/**
 * Call the tool the way the SDK does. `execute` is non-null on a tool built
 * with an execute function, but the SDK's type keeps it optional on the
 * general `Tool`, so the test asserts it once here.
 */
async function read(
  tool: ReturnType<typeof session>['tool'],
  id: unknown
): Promise<ReadDocumentResult> {
  if (typeof tool.execute !== 'function') throw new Error('tool has no execute')
  return (await tool.execute({ id }, options())) as ReadDocumentResult
}

function options() {
  return {
    toolCallId: 'call-1',
    messages: [],
    abortSignal: undefined,
  } as unknown as Parameters<
    NonNullable<ReturnType<typeof session>['tool']['execute']>
  >[1]
}

describe('the tool definition', () => {
  test('is named read_document and takes a single string id', async () => {
    expect(READ_DOCUMENT_TOOL_NAME).toBe('read_document')

    expect(await READ_DOCUMENT_INPUT_SCHEMA.jsonSchema).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    })
  })

  test('tells the model what both refusals mean', () => {
    const { tool } = session()
    expect(String(tool.description)).toContain('unknown_document')
    expect(String(tool.description)).toContain('read_budget_exhausted')
  })
})

describe('reading a document', () => {
  test('a known id returns the id, title and verbatim text', async () => {
    const { tool } = session()
    expect(await read(tool, 'resume')).toEqual({
      id: 'resume',
      title: 'Title of resume',
      text: 'Matt led the platform migration at Thryv.',
    })
  })

  test('an unknown id is refused, not thrown', async () => {
    const { tool } = session()
    expect(await read(tool, 'salary-negotiations')).toEqual({
      error: 'unknown_document',
    })
  })

  test('an id the index never listed is refused even though the store has it', async () => {
    // The index is the allow-list. A model that learns an id some other way —
    // a visitor naming one, a stale answer — still cannot reach the document.
    const hidden = document('private', 'Not in the index.')
    const { tool } = session({
      entries: entries.filter(entry => entry.id !== 'private'),
      readKnowledgeDocument: (id: string) =>
        id === 'private' ? hidden : store.get(id),
    })
    expect(await read(tool, 'private')).toEqual({ error: 'unknown_document' })
  })

  test('an index entry with no document behind it is refused, not thrown', async () => {
    const { tool } = session({ readKnowledgeDocument: () => undefined })
    expect(await read(tool, 'resume')).toEqual({ error: 'unknown_document' })
  })

  test('a refused read costs nothing against the budget', async () => {
    const s = session()
    await read(s.tool, 'nope')
    await read(s.tool, 'also-nope')
    expect(s.documentsRead()).toBe(0)
    expect(s.readTokens()).toBe(0)
    // The three real reads are all still available.
    expect(await read(s.tool, 'resume')).toMatchObject({ id: 'resume' })
    expect(await read(s.tool, 'faq')).toMatchObject({ id: 'faq' })
    expect(await read(s.tool, 'projects')).toMatchObject({ id: 'projects' })
  })
})

describe('the read budget', () => {
  test('the fourth read is refused', async () => {
    const s = session()
    for (const id of ['resume', 'faq', 'projects']) {
      expect(await read(s.tool, id)).toMatchObject({ id })
    }
    expect(s.documentsRead()).toBe(KNOWLEDGE_READ_BUDGET.maxDocuments)

    expect(await read(s.tool, 'open-source')).toEqual({
      error: 'read_budget_exhausted',
    })
    expect(s.documentsRead()).toBe(KNOWLEDGE_READ_BUDGET.maxDocuments)
  })

  test('a single document over the whole token budget is unreadable', async () => {
    const huge = document(
      'huge',
      'x'.repeat((KNOWLEDGE_READ_BUDGET.maxTokens + 1) * 4)
    )
    const s = createReadDocumentSession({
      entries: [entry(huge.id, huge.text)],
      readKnowledgeDocument: () => huge,
    })

    // Its own error, not the budget's: no amount of reading less would let
    // this document through, so the model must not be invited to retry it.
    expect(await read(s.tool, 'huge')).toEqual({ error: 'document_too_large' })
    expect(await read(s.tool, 'huge')).toEqual({ error: 'document_too_large' })
    // The refusal is total: nothing was sent, so nothing is charged.
    expect(s.documentsRead()).toBe(0)
    expect(s.readTokens()).toBe(0)
    // Counted apart from ordinary budget refusals: only the corpus can fix it.
    expect(s.readsRefused()).toEqual({ unknown: 0, budget: 0, tooLarge: 2 })
  })

  test('refusals are counted by reason', async () => {
    const s = session()
    await read(s.tool, 'nope')
    await read(s.tool, 'also-nope')
    for (const id of ['resume', 'faq', 'projects']) await read(s.tool, id)
    await read(s.tool, 'open-source')

    expect(s.readsRefused()).toEqual({ unknown: 2, budget: 1, tooLarge: 0 })
  })

  test('the token budget counts across reads, not per read', async () => {
    // Two documents that each fit on their own but not together.
    const half = 'x'.repeat(KNOWLEDGE_READ_BUDGET.maxTokens * 2 + 8)
    const a = document('a', half)
    const b = document('b', half)
    const s = createReadDocumentSession({
      entries: [a, b].map(doc => entry(doc.id, doc.text)),
      readKnowledgeDocument: (id: string) => (id === 'a' ? a : b),
    })

    expect(await read(s.tool, 'a')).toMatchObject({ id: 'a' })
    expect(await read(s.tool, 'b')).toEqual({ error: 'read_budget_exhausted' })
    expect(s.documentsRead()).toBe(1)
    expect(s.readTokens()).toBeLessThanOrEqual(KNOWLEDGE_READ_BUDGET.maxTokens)
  })

  test('each session has its own budget', async () => {
    const first = session()
    for (const id of ['resume', 'faq', 'projects']) await read(first.tool, id)
    expect(await read(first.tool, 'open-source')).toEqual({
      error: 'read_budget_exhausted',
    })

    const second = session()
    expect(await read(second.tool, 'open-source')).toMatchObject({
      id: 'open-source',
    })
  })
})

describe('the ledger the handler reports', () => {
  test('a document read twice is charged twice', async () => {
    // The budget counts what was sent to the model, not how many distinct
    // documents it asked for.
    const s = session()
    await read(s.tool, 'resume')
    await read(s.tool, 'resume')

    expect(s.documentsRead()).toBe(2)
  })

  test('nothing read means nothing to report', () => {
    const s = session()
    expect(s.documentsRead()).toBe(0)
    expect(s.readTokens()).toBe(0)
  })

  test('readTokens is the text actually handed over', async () => {
    const s = session()
    await read(s.tool, 'resume')
    expect(s.readTokens()).toBe(
      Math.ceil('Matt led the platform migration at Thryv.'.length / 4)
    )
  })
})

describe('the id is untrusted input', () => {
  test('the schema rejects anything that is not {id: string}', async () => {
    // A JSON Schema alone is only a hint to the model; the SDK skips
    // validation on a schema with no validator. This is the guard that makes
    // `id` a string by the time a read sees it.
    const validate = READ_DOCUMENT_INPUT_SCHEMA.validate
    expect(validate).toBeDefined()

    for (const bad of [{}, { id: 7 }, { id: null }, [], 'resume', null]) {
      expect(await validate?.(bad)).toMatchObject({ success: false })
    }
    expect(await validate?.({ id: 'resume' })).toMatchObject({
      success: true,
      value: { id: 'resume' },
    })
  })
})
