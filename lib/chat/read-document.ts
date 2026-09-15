import { jsonSchema, tool, type Tool } from 'ai'
import {
  KNOWLEDGE_READ_BUDGET,
  type KnowledgeDocument,
  type KnowledgeEntry,
} from '@/lib/knowledge'
import { estimateTokens } from './validate'

/**
 * The assistant's one tool: fetch the verbatim text of an indexed document
 * (MTC-31).
 *
 * The index in the prompt is a catalogue of summaries. This is how the model
 * turns a catalogue entry into something it may quote, and it is the only way
 * a document's text enters the conversation.
 *
 * Two boundaries meet in this file, and both are enforced here rather than
 * trusted to the prompt:
 *
 *   - The id is model-generated, which makes it untrusted input in exactly
 *     the way a query parameter is. It is matched against the index before
 *     any read, so the tool can only ever return a document the model was
 *     already shown, and can never be talked into reading something else.
 *   - The read budget is the cost ceiling. A prompt can ask for at most three
 *     documents; only this code can guarantee it, so KNOWLEDGE_READ_BUDGET is
 *     counted per request on the server.
 *
 * Nothing here throws at the model. A refusal comes back as a small structured
 * object the policy tells it how to react to, because a thrown tool error ends
 * the step with no answer, and "the id was wrong" is a recoverable mistake.
 */

/**
 * Why a read was refused. Every value is quoted in SYSTEM_PROMPT.
 *
 * `document_too_large` is separated from `read_budget_exhausted` because the
 * two mean opposite things to the model: the budget one is "you have spent
 * what this question gets, answer from what you have", while this one is
 * "this particular document will never fit, try a different one" — retrying
 * it, or freeing budget by reading less, cannot help. It is also a corpus
 * fault worth seeing in the logs: a document larger than the whole read
 * budget is permanently unreadable, so the per-document ceiling that would
 * prevent it belongs in MTC-29's build step, not here.
 */
export type ReadDocumentError =
  'unknown_document' | 'read_budget_exhausted' | 'document_too_large'

export type ReadDocumentResult =
  { id: string; title: string; text: string } | { error: ReadDocumentError }

/** One successful read, in the order it happened. */
export interface DocumentRead {
  id: string
  title: string
  url: string
  /** Estimated tokens of the text handed back, and charged to the budget. */
  tokens: number
}

/** What the UI renders as a source chip (MTC-33). */
export interface ChatSource {
  id: string
  title: string
  url: string
}

export interface ReadDocumentSessionDeps {
  /** The entries the model was shown. The only ids a read may resolve. */
  entries: readonly KnowledgeEntry[]
  readKnowledgeDocument: (id: string) => KnowledgeDocument | undefined
}

/**
 * One request's worth of reading: the tool the model is offered, plus the
 * ledger of what it actually read.
 *
 * The budget is per request, so the tool has to be per request too — a
 * module-level tool would let one visitor's reads count against another's.
 */
export interface ReadDocumentSession {
  tool: Tool
  /** Successful reads, de-duplicated, in the order each id was first read. */
  sources(): ChatSource[]
  /** Aggregate counters for the log line. Numbers only, never text. */
  documentsRead(): number
  readTokens(): number
  /** Reads refused, by reason, so the log can tell the failure modes apart. */
  readsRefused(): ReadsRefused
}

/** How many reads each guard turned away during one request. */
export interface ReadsRefused {
  unknown: number
  budget: number
  tooLarge: number
}

/**
 * The tool's input schema, with a validator. Exported so the guard on it can
 * be asserted directly rather than dug back out of the built tool.
 *
 * `jsonSchema()` on its own only describes the input to the model; it does
 * not check what comes back (the SDK skips validation when a schema has no
 * `validate`). The validator is what makes `input.id` a string at runtime and
 * not merely in the types, which matters because everything downstream treats
 * it as one.
 */
export const READ_DOCUMENT_INPUT_SCHEMA = jsonSchema<{ id: string }>(
  {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description:
          'The id of an entry in the document index, spelled exactly as the index spells it.',
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
  {
    validate: value => {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof (value as { id?: unknown }).id === 'string'
      ) {
        return { success: true, value: value as { id: string } }
      }
      return {
        success: false,
        error: new Error('read_document needs an object with a string id'),
      }
    },
  }
)

export function createReadDocumentSession({
  entries,
  readKnowledgeDocument,
}: ReadDocumentSessionDeps): ReadDocumentSession {
  const indexed = new Map(entries.map(entry => [entry.id, entry]))
  const reads: DocumentRead[] = []
  const refused: ReadsRefused = { unknown: 0, budget: 0, tooLarge: 0 }
  let spentTokens = 0

  function read(id: string): ReadDocumentResult {
    // Checked before the id is even looked at: once three documents are in,
    // no fourth read can happen, whatever the model asks for.
    if (reads.length >= KNOWLEDGE_READ_BUDGET.maxDocuments) {
      refused.budget += 1
      return { error: 'read_budget_exhausted' }
    }

    // An id the index never listed is refused here, so a model that
    // hallucinates a path, or is talked into one by a visitor, reaches no
    // document at all. A miss costs nothing against the budget: it returned
    // no text, and the step cap already bounds how often it can happen.
    if (!indexed.has(id)) {
      refused.unknown += 1
      return { error: 'unknown_document' }
    }

    const document = readKnowledgeDocument(id)
    // The index and the store disagreeing is a deployment fault, not a
    // visitor's. The model gets the same recoverable answer either way.
    if (!document) {
      refused.unknown += 1
      return { error: 'unknown_document' }
    }

    // Measured off the text actually being handed over rather than read from
    // the entry's advertised `tokenEstimate`: the budget exists to bound what
    // this request sends, so it counts what this request sends.
    const tokens = estimateTokens(document.text)
    // Bigger than the whole budget, so no amount of reading less would let it
    // through: the model is told that plainly rather than being invited to
    // retry, and the count is logged because only the corpus can fix it.
    if (tokens > KNOWLEDGE_READ_BUDGET.maxTokens) {
      refused.tooLarge += 1
      return { error: 'document_too_large' }
    }
    if (spentTokens + tokens > KNOWLEDGE_READ_BUDGET.maxTokens) {
      refused.budget += 1
      return { error: 'read_budget_exhausted' }
    }

    spentTokens += tokens
    reads.push({
      id: document.id,
      title: document.title,
      url: document.url,
      tokens,
    })
    return { id: document.id, title: document.title, text: document.text }
  }

  return {
    tool: tool({
      description: `Read the full text of one document from the index. Takes the document's id. Returns {"id", "title", "text"}, or {"error": "unknown_document"} if no entry has that id, or {"error": "read_budget_exhausted"} once this question's limit of ${KNOWLEDGE_READ_BUDGET.maxDocuments} documents is used up, or {"error": "document_too_large"} if that one document is too big to read at all.`,
      inputSchema: READ_DOCUMENT_INPUT_SCHEMA,
      execute: ({ id }) => read(id),
    }),
    sources() {
      // A model that reads the same document twice pays for it twice, but
      // the visitor should still see one chip for it.
      const seen = new Set<string>()
      const sources: ChatSource[] = []
      for (const { id, title, url } of reads) {
        if (seen.has(id)) continue
        seen.add(id)
        sources.push({ id, title, url })
      }
      return sources
    },
    documentsRead: () => reads.length,
    readTokens: () => spentTokens,
    readsRefused: () => ({ ...refused }),
  }
}
