/**
 * `bun run knowledge:check`
 *
 * Prints what the career assistant would be given — the index text as the
 * model sees it, what each document would cost to read, and the headroom
 * left under KNOWLEDGE_INDEX_TOKEN_CEILING — and then runs the content
 * guards in lib/knowledge/knowledge.test.ts. Exits non-zero if the corpus
 * fails to build or any guard fails, so it is safe to wire into CI or a
 * pre-commit hook next to scripts/knowledge-denylist-check.sh.
 */
import path from 'path'
import {
  listKnowledgeDocuments,
  loadKnowledgeIndex,
  KNOWLEDGE_INDEX_TOKEN_CEILING,
  KNOWLEDGE_READ_BUDGET,
} from '../lib/knowledge'

// Leading "./" so bun test treats these as paths rather than name filters.
const GUARD_TESTS = [
  path.join('lib', 'knowledge', 'knowledge.test.ts'),
  path.join('scripts', 'knowledge-denylist-check.test.ts'),
  path.join('scripts', 'new-blog-post.test.ts'),
].map(file => `.${path.sep}${file}`)

const index = loadKnowledgeIndex()
const documents = listKnowledgeDocuments()

console.log('--- the index, as the model sees it ---\n')
console.log(index.text)
console.log('\n--- documents the model can fetch ---\n')
for (const document of documents) {
  console.log(
    `  ${document.url.padEnd(48)} ${document.topic.padEnd(12)} ~${document.tokenEstimate} tokens`
  )
}

const bodyTokens = documents.reduce((sum, d) => sum + d.tokenEstimate, 0)
// The three largest documents: the worst a single turn can spend under
// KNOWLEDGE_READ_BUDGET.maxDocuments, and the number worth watching as the
// corpus grows.
const worstRead = [...documents]
  .sort((a, b) => b.tokenEstimate - a.tokenEstimate)
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
  `worst-case read: ~${worstRead} tokens (the ${KNOWLEDGE_READ_BUDGET.maxDocuments} largest, budget ${KNOWLEDGE_READ_BUDGET.maxTokens})`
)
console.log(`built at:        ${index.builtAt}`)
console.log(`\nrunning guards in ${GUARD_TESTS.join(' ')}\n`)

// Spawned rather than imported so the guards keep running as ordinary bun
// tests in CI, with one definition of what the corpus may contain.
const guards = Bun.spawnSync(['bun', 'test', ...GUARD_TESTS], {
  stdout: 'inherit',
  stderr: 'inherit',
})
process.exit(guards.exitCode ?? 1)
