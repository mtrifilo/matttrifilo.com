/**
 * `bun run knowledge:check`
 *
 * Prints what the career assistant would be given — the index text as the
 * model sees it, what each document would cost to read, anything the build
 * dropped, and the headroom left under the two ceilings — and then runs the
 * content guards in lib/knowledge/knowledge.test.ts. Exits non-zero if the
 * corpus fails to build, if a single turn could not afford its three reads,
 * or if any guard fails, so it is safe to wire into CI or a pre-commit hook
 * next to scripts/knowledge-denylist-check.sh.
 *
 * The corpus is built directly rather than through lib/knowledge: the
 * loaders there are the chat route's contract and deliberately expose only
 * what a request needs, while this script is the authoring view and wants
 * the offcuts too.
 */
import path from 'path'
import {
  buildKnowledgeCorpus,
  KNOWLEDGE_DOCUMENT_TOKEN_CEILING,
  KNOWLEDGE_INDEX_TOKEN_CEILING,
} from '../lib/knowledge/build'
import { KNOWLEDGE_READ_BUDGET } from '../lib/knowledge'

// Leading "./" so bun test treats these as paths rather than name filters.
const GUARD_TESTS = [
  path.join('lib', 'knowledge', 'knowledge.test.ts'),
  path.join('scripts', 'knowledge-denylist-check.test.ts'),
  path.join('scripts', 'new-blog-post.test.ts'),
].map(file => `.${path.sep}${file}`)

const corpus = buildKnowledgeCorpus()
const { index, documents, unanswered, droppedDocuments } = corpus

console.log('--- the index, as the model sees it ---\n')
console.log(index.text)

console.log('\n--- documents the model can fetch ---\n')
for (const document of documents) {
  console.log(
    `  ${document.url.padEnd(48)} ${document.topic.padEnd(12)} ~${document.tokenEstimate} tokens`
  )
}

// The faq drops its unanswered questions, and a drop that prints nothing
// is indistinguishable from a file that was never read. Say what is
// missing, every run.
if (unanswered.length > 0 || droppedDocuments.length > 0) {
  console.log('\n--- dropped: unanswered, so neither published nor sent ---\n')
  for (const question of unanswered) {
    console.log(`  ${question.file}  ## ${question.heading}`)
  }
  for (const file of droppedDocuments) {
    console.log(`  ${file}  (whole document: nothing in it is answered yet)`)
  }
}

const bodyTokens = documents.reduce((sum, d) => sum + d.tokenEstimate, 0)
const largest = [...documents].sort((a, b) => b.tokenEstimate - a.tokenEstimate)
// The worst a single turn can spend under KNOWLEDGE_READ_BUDGET: the
// per-document ceiling alone cannot promise this, so check the real number.
const worstRead = largest
  .slice(0, KNOWLEDGE_READ_BUDGET.maxDocuments)
  .reduce((sum, d) => sum + d.tokenEstimate, 0)

const headroom = KNOWLEDGE_INDEX_TOKEN_CEILING - index.tokenEstimate
const used = (
  (index.tokenEstimate / KNOWLEDGE_INDEX_TOKEN_CEILING) *
  100
).toFixed(1)

console.log(`\ndocuments:       ${documents.length}`)
console.log(
  `index tokens:    ~${index.tokenEstimate} (chars / 4), in every prompt`
)
console.log(`index ceiling:   ${KNOWLEDGE_INDEX_TOKEN_CEILING}`)
console.log(`headroom:        ~${headroom} tokens (${used}% of ceiling used)`)
console.log(`document tokens: ~${bodyTokens} across the whole corpus`)
console.log(
  `largest document: ~${largest[0].tokenEstimate} tokens (ceiling ${KNOWLEDGE_DOCUMENT_TOKEN_CEILING})`
)
console.log(
  `worst-case read: ~${worstRead} tokens (the ${KNOWLEDGE_READ_BUDGET.maxDocuments} largest, budget ${KNOWLEDGE_READ_BUDGET.maxTokens})`
)
console.log(`built at:        ${index.builtAt}`)

if (worstRead > KNOWLEDGE_READ_BUDGET.maxTokens) {
  console.error(
    `\nknowledge: the ${KNOWLEDGE_READ_BUDGET.maxDocuments} largest documents are ~${worstRead} tokens together, over the ${KNOWLEDGE_READ_BUDGET.maxTokens} a turn may spend. The model cannot read them in one answer. Split the largest ones: ${largest
      .slice(0, KNOWLEDGE_READ_BUDGET.maxDocuments)
      .map(d => `${d.id} (~${d.tokenEstimate})`)
      .join(', ')}`
  )
  process.exit(1)
}

console.log(`\nrunning guards in ${GUARD_TESTS.join(' ')}\n`)

// Spawned rather than imported so the guards keep running as ordinary bun
// tests in CI, with one definition of what the corpus may contain.
const guards = Bun.spawnSync(['bun', 'test', ...GUARD_TESTS], {
  stdout: 'inherit',
  stderr: 'inherit',
})
process.exit(guards.exitCode ?? 1)
