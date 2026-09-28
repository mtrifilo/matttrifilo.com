import { buildKnowledgeCorpus } from './build'
import type {
  KnowledgeCorpus,
  KnowledgeDocument,
  KnowledgeIndex,
} from './build'

/**
 * The career assistant's corpus: the only source it may read.
 *
 * Everything the assistant knows comes from content/knowledge, which is
 * written for the public. Nothing in this module, or anything it imports,
 * reads a private document or makes a network call, at build time or at
 * request time. lib/knowledge/knowledge.test.ts is the mechanical guard on
 * what those files may contain.
 *
 * This module is the contract the chat route depends on; keep it to these
 * exports. The build itself lives in ./build
 * so tests can rebuild without going through the cache below.
 */

export type {
  KnowledgeDocument,
  KnowledgeEntry,
  KnowledgeIndex,
  KnowledgeSource,
} from './build'
export {
  KNOWLEDGE_DOCUMENT_TOKEN_CEILING,
  KNOWLEDGE_INDEX_TOKEN_CEILING,
} from './build'

/**
 * What one turn may spend fetching documents.
 *
 * Nothing in the build enforces this: it is the chat route's policy, and
 * it lives here because here is where the route looks. Three documents is
 * the point where an answer stops being "Matt wrote this" and starts being
 * a survey; 20k tokens is a generous ceiling for three of them that still
 * leaves a long conversation room to breathe. A question that genuinely
 * needs more is a question to answer with a link to the page.
 */
export const KNOWLEDGE_READ_BUDGET = {
  maxDocuments: 3,
  maxTokens: 20_000,
} as const

let cached: KnowledgeCorpus | undefined
let byId: Map<string, KnowledgeDocument> | undefined

/**
 * Parsed once per process and reused. Synchronous on purpose: callers
 * assemble a prompt or render a page from it, and the files are a few tens
 * of kilobytes read once.
 *
 * Throws if the files do not parse or the index is over
 * KNOWLEDGE_INDEX_TOKEN_CEILING. A failure is not recoverable by retrying,
 * so a throw is left to surface rather than cached as an empty corpus.
 */
function corpus(): KnowledgeCorpus {
  if (!cached) {
    cached = buildKnowledgeCorpus()
    byId = new Map(cached.documents.map(document => [document.id, document]))
  }
  return cached
}

/**
 * The index the model sees on every turn: one line per document, and the
 * rendered text to drop into the prompt.
 */
export function loadKnowledgeIndex(): KnowledgeIndex {
  return corpus().index
}

/**
 * One document by id, or undefined when there is no such document.
 *
 * The id comes from the model, so it is untrusted input: this is a Map
 * lookup over documents already parsed, never a path built from a caller's
 * string, and it returns undefined rather than throwing for anything it
 * does not recognise, including a non-string, which is what a malformed
 * tool call produces.
 */
export function readKnowledgeDocument(
  id: string
): KnowledgeDocument | undefined {
  if (typeof id !== 'string' || id === '') return undefined
  corpus()
  return byId!.get(id)
}

/**
 * Every document, in index order.
 *
 * Nothing renders these today: the assistant fetches one at a time by id,
 * and no page serves them. Kept as the read side of the corpus, and covered
 * by lib/knowledge/knowledge.test.ts.
 */
export function listKnowledgeDocuments(): KnowledgeDocument[] {
  return corpus().documents
}
