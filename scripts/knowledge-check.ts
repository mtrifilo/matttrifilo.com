/**
 * `bun run knowledge:check`
 *
 * Prints what the career assistant would be given — section count, per
 * section size, the token estimate and the headroom left under
 * KNOWLEDGE_TOKEN_CEILING — and then runs the content guards in
 * lib/knowledge/knowledge.test.ts. Exits non-zero if the knowledge base
 * fails to build or any guard fails, so it is safe to wire into CI or a
 * pre-commit hook next to scripts/knowledge-denylist-check.sh.
 */
import path from 'path'
import { loadKnowledgeBase, KNOWLEDGE_TOKEN_CEILING } from '../lib/knowledge'

// Leading "./" so bun test treats these as paths rather than name filters.
const GUARD_TESTS = [
  path.join('lib', 'knowledge', 'knowledge.test.ts'),
  path.join('scripts', 'knowledge-denylist-check.test.ts'),
  path.join('scripts', 'new-blog-post.test.ts'),
].map(file => `.${path.sep}${file}`)

const base = loadKnowledgeBase()

console.log(`sections:        ${base.sections.length}`)
for (const section of base.sections) {
  const tokens = Math.ceil(section.text.length / 4)
  console.log(
    `  ${section.id.padEnd(40)} ${section.source.padEnd(12)} ~${tokens} tokens`
  )
}
console.log(`token estimate:  ~${base.tokenEstimate} (chars / 4)`)
console.log(`ceiling:         ${KNOWLEDGE_TOKEN_CEILING}`)
const headroom = KNOWLEDGE_TOKEN_CEILING - base.tokenEstimate
const used = ((base.tokenEstimate / KNOWLEDGE_TOKEN_CEILING) * 100).toFixed(1)
console.log(`headroom:        ~${headroom} tokens (${used}% of ceiling used)`)
console.log(`built at:        ${base.builtAt}`)
console.log(`\nrunning guards in ${GUARD_TESTS.join(' ')}\n`)

// Spawned rather than imported so the guards keep running as ordinary bun
// tests in CI, with one definition of what the knowledge base may contain.
const guards = Bun.spawnSync(['bun', 'test', ...GUARD_TESTS], {
  stdout: 'inherit',
  stderr: 'inherit',
})
process.exit(guards.exitCode ?? 1)
