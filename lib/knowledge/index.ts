import { buildKnowledgeBase } from './build'
import type { KnowledgeBase } from './build'

/**
 * The career assistant's knowledge base: the only source it may read.
 *
 * Everything the assistant knows comes from content/knowledge/*.md, which
 * is written for the public. Nothing in this module — or anything it
 * imports — reads a private document or makes a network call, at build
 * time or at request time. lib/knowledge/knowledge.test.ts is the
 * mechanical guard on what those files may contain.
 *
 * This module is the contract the chat route depends on; keep it to these
 * four exports. The build itself lives in ./build so tests can rebuild
 * without going through the cache below.
 */

export type {
  KnowledgeBase,
  KnowledgeSection,
  KnowledgeSource,
} from './build'
export { KNOWLEDGE_TOKEN_CEILING } from './build'

let cached: KnowledgeBase | undefined

/**
 * The whole knowledge base, read from disk on the first call and reused
 * afterwards. Synchronous on purpose: callers assemble a prompt from it,
 * and the files are a few tens of kilobytes read once per process.
 *
 * Throws if the files do not parse or the text is over
 * KNOWLEDGE_TOKEN_CEILING. A failure is not recoverable by retrying, so a
 * throw is left to surface rather than cached as an empty base.
 */
export function loadKnowledgeBase(): KnowledgeBase {
  if (!cached) cached = buildKnowledgeBase()
  return cached
}
