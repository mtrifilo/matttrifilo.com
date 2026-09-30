import type { KnowledgeCorpus } from './build'

/**
 * What `bun run knowledge:check` prints under "dropped": each faq file's
 * dropped introduction, then its dropped questions, in the order they are
 * written, then every file dropped whole. Empty when nothing was dropped.
 *
 * Kept apart from the script so a test can hold the listing, since a drop
 * that prints nothing is indistinguishable from a file that was never read.
 */
export function droppedReport(
  corpus: Pick<
    KnowledgeCorpus,
    'unanswered' | 'droppedDocuments' | 'droppedIntros'
  >
): string[] {
  // The sort is stable and labels sort in build order, so within a file the
  // introduction stays ahead of its questions and they keep theirs.
  const sections = [
    ...corpus.droppedIntros.map(file => ({
      file,
      what: '(the introduction, before the first ##)',
    })),
    ...corpus.unanswered.map(question => ({
      file: question.file,
      what: `## ${question.heading}`,
    })),
  ].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  return [
    ...sections.map(({ file, what }) => `${file}  ${what}`),
    ...corpus.droppedDocuments.map(
      file => `${file}  (whole document: nothing in it is answered yet)`
    ),
  ]
}
