import type { KnowledgeDocument } from '@/lib/knowledge'
import type { ProgressView } from '@/lib/chat/progress'

/**
 * Which documents a run's answer was actually handed, and which the route
 * refused after finding them (MTC-80).
 *
 * Two records meet here, because neither is enough alone.
 *
 * The store record is every id `readKnowledgeDocument` resolved. It is
 * written before the route decides anything: read-document.ts looks the
 * document up first and only then refuses it for being larger than the
 * whole read budget (`document_too_large`), or for not fitting what is left
 * of it or for carrying the next model call past CHAT_MAX_INPUT_TOKENS
 * (both `read_budget_exhausted`). So it lists documents whose text the model
 * never received.
 *
 * The progress record is the route's own account of the reads that
 * succeeded: the `data-progress` part it streams to the browser. A read's
 * row goes up when the call starts and is withdrawn when the tool answers
 * with a refusal, unless another call for the same id succeeded, so the
 * rows left at the end of a run are the documents the model was given text
 * for. lib/chat/handler.test.ts holds the route to that, and
 * `read-ledger.test.ts` checks this split against the real handler.
 *
 * A read refused on the document cap, or for an id the index does not list,
 * is turned away before the store is asked, so it appears in neither list.
 * Such a read handed the model nothing, which is the reason the lists exist.
 */
export interface ReadLedger {
  /** Documents whose text reached the model, in the order first resolved. */
  readIds: string[]
  /**
   * Documents the store resolved and the route then refused on every call,
   * for their size, the read budget, or the next call's room under the input
   * cap. The model saw only the refusal.
   * When `readsUnproven` is set, this holds every id resolved instead,
   * because nothing on the stream says which of them were read.
   */
  refusedIds: string[]
  /**
   * The store resolved something and the stream carried no usable progress
   * part, so no read is proven. Set so a red row blames the missing account
   * rather than a refusal that may never have happened.
   */
  readsUnproven?: true
}

/**
 * Wraps the store so a run records what it resolved, and splits that record
 * once the stream has been read.
 *
 * One per request, like the handler it is handed to: the record belongs to
 * one run.
 */
export function createReadLedger(
  readKnowledgeDocument: (id: string) => KnowledgeDocument | undefined
): {
  readKnowledgeDocument: (id: string) => KnowledgeDocument | undefined
  split: (progress: ProgressView | undefined) => ReadLedger
} {
  const resolved: string[] = []
  return {
    readKnowledgeDocument: (id: string) => {
      const document = readKnowledgeDocument(id)
      if (document) resolved.push(document.id)
      return document
    },
    split: progress => splitReadLedger(resolved, progress),
  }
}

/**
 * Splits the ids the store resolved into completed and refused reads.
 *
 * A resolved id counts as read only when the route's final progress part
 * still lists it as a document step. Everything else it resolved is
 * refused, including every id of a run with no usable progress part: a run
 * whose part is missing or malformed proves no read, and the direction of
 * that error is a read assertion going red, never one passing on a document
 * the answer did not see.
 *
 * Both lists are distinct. A document read twice was read, and one read and
 * then refused on a repeat was read too, because its text did reach the
 * model once.
 */
export function splitReadLedger(
  resolved: readonly string[],
  progress: ProgressView | undefined
): ReadLedger {
  const completed = new Set(
    (progress?.steps ?? [])
      .filter(step => step.kind !== 'activity')
      .map(step => step.id)
  )
  const distinct = [...new Set(resolved)]
  return {
    readIds: distinct.filter(id => completed.has(id)),
    refusedIds: distinct.filter(id => !completed.has(id)),
    ...(progress === undefined && distinct.length > 0
      ? { readsUnproven: true as const }
      : {}),
  }
}
