/**
 * How many section titles one read row of the progress view may carry, and
 * how long each may be.
 *
 * Two layers hold these numbers and neither may depend on the other. The
 * corpus build (lib/knowledge/build.ts) extracts a document's headings and
 * never emits one past either cap; the progress wire (lib/chat/progress.ts)
 * validates what arrives against the same caps. The chat layer already
 * depends on the corpus, so the build importing from the chat layer would
 * close the loop; this module is the floor both stand on instead.
 *
 * It has no imports and must keep none: lib/chat/progress.ts is part of the
 * browser bundle, and anything imported here would ride along into it.
 *
 * Distrust bounds on the wire. An over-long heading is not a `##` line from
 * the corpus, so it is dropped rather than truncated, the same way an
 * over-long document title is.
 *
 * The count is the exception to that rule, and the only reason it is safe
 * is that nothing is meant to reach it: a row that showed eight of a
 * document's nine sections without saying so would be the quiet half-truth
 * the progress view exists to avoid. lib/knowledge/knowledge.test.ts fails
 * before a corpus document reaches the count, which is what keeps the
 * truncation theoretical. It does not catch a heading past the character
 * cap: the build skips that heading, so the row lists the others.
 *
 * MAX_TITLE_CHARS stays in lib/chat/progress.ts: only the wire enforces it,
 * and the corpus is held under it by a test rather than by the build.
 */
export const MAX_HEADINGS = 12
export const MAX_HEADING_CHARS = 120
