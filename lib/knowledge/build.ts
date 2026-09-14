import fs from 'fs'
import path from 'path'

/**
 * Builds the single block of text the career assistant is allowed to read.
 *
 * The one rule this file exists to enforce: the assistant's only source is
 * content/knowledge/*.md, which is written for the public. Nothing here
 * reaches outside that directory, and nothing fetches anything at build or
 * request time.
 *
 * index.ts is the module the chat route imports; it holds the memoised
 * `loadKnowledgeBase()` and nothing else. The build lives here so the
 * guards in knowledge.test.ts can rebuild on demand (byte-stability) and
 * against a fixture directory (ceiling enforcement) without reaching into
 * the cache the route depends on.
 */

export type KnowledgeSource =
  'resume' | 'blog' | 'open-source' | 'derived' | 'faq'

export interface KnowledgeSection {
  id: string
  title: string
  url: string
  source: KnowledgeSource
  text: string
}

export interface KnowledgeBase {
  text: string
  sections: KnowledgeSection[]
  tokenEstimate: number
  builtAt: string
}

/**
 * The most tokens the knowledge base may occupy in a prompt. Chosen to
 * leave room for the system prompt, the conversation and the answer inside
 * a long-context model's window; the build throws rather than silently
 * sending a prompt that no longer fits.
 */
export const KNOWLEDGE_TOKEN_CEILING = 60_000

export const KNOWLEDGE_DIR = path.join(process.cwd(), 'content', 'knowledge')

const SOURCES: readonly KnowledgeSource[] = [
  'resume',
  'blog',
  'open-source',
  'derived',
  'faq',
]

/**
 * The fixed order the non-blog sections appear in, most generally useful
 * first. Blog posts follow, newest first. A file whose id is neither in
 * this list nor prefixed `blog-` fails the build: where a new kind of
 * knowledge belongs in the prompt is a decision to make here, on purpose,
 * not one to leave to readdir order.
 */
const SECTION_ORDER: readonly string[] = [
  'resume',
  'faq',
  'projects',
  'career-timeline',
  'open-source',
]

const BLOG_PREFIX = 'blog-'

const FRONTMATTER_BLOCK = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/
const FRONTMATTER_FIELD = /^([A-Za-z]+):[ \t]*(.*)$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** A `##` heading, and only `##` — `###` and deeper stay inside a block. */
const BLOCK_HEADING = /^## (?!#)/
/**
 * A body still waiting on Matt. faq.md ships its questions with `TODO
 * (Matt)` bodies; those blocks are dropped so a placeholder never reaches
 * the model, and knowledge.test.ts asserts no `TODO` survives into the
 * built text.
 */
const UNANSWERED = /^TODO\b/

interface Frontmatter {
  id: string
  title: string
  url: string
  source: KnowledgeSource
  updated: string
}

interface KnowledgeFile {
  frontmatter: Frontmatter
  /** The `##` blocks Matt has actually answered, plus any lead-in text. */
  text: string
}

interface Block {
  heading: string
  body: string
}

/** `'value'`, `"value"` or a bare value, as written in the frontmatter. */
function unquote(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed[0]
  if ((quote === "'" || quote === '"') && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Reads the five frontmatter fields by hand rather than through a YAML
 * parser. YAML turns an unquoted `updated: 2026-03-01` into a JS Date in a
 * local timezone, and the whole point of this build is that its output is
 * byte-identical every time it runs, on any machine.
 */
function parseFrontmatter(raw: string, source: string): Frontmatter {
  const fields = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const match = FRONTMATTER_FIELD.exec(line)
    if (!match) {
      throw new Error(
        `${source}: frontmatter line is not "key: value": ${line}`
      )
    }
    fields.set(match[1], unquote(match[2]))
  }

  const required = (key: string): string => {
    const value = fields.get(key)
    if (!value) throw new Error(`${source}: frontmatter needs a ${key}`)
    return value
  }

  const id = required('id')
  const title = required('title')
  const url = required('url')
  const source_ = required('source')
  const updated = required('updated')

  const expectedId = path.basename(source, '.md')
  if (id !== expectedId) {
    throw new Error(
      `${source}: id "${id}" must match the file name ("${expectedId}"), so section ids stay stable and unique`
    )
  }
  if (!SOURCES.includes(source_ as KnowledgeSource)) {
    throw new Error(
      `${source}: source must be one of ${SOURCES.join(' | ')} (got "${source_}")`
    )
  }
  if (!ISO_DATE.test(updated) || !isRealDate(updated)) {
    throw new Error(
      `${source}: updated must be a real ISO date, YYYY-MM-DD (got "${updated}")`
    )
  }
  // The title and url are interpolated into the section tag as attributes.
  // Refuse anything that would need escaping instead of escaping it, so the
  // wrapper stays something a human can read in a prompt dump.
  for (const [key, value] of [
    ['title', title],
    ['url', url],
  ] as const) {
    if (/["<>\r\n]/.test(value)) {
      throw new Error(
        `${source}: ${key} may not contain a quote, angle bracket or newline (got ${value})`
      )
    }
  }
  if (!url.startsWith('https://')) {
    throw new Error(`${source}: url must be an https:// URL (got "${url}")`)
  }

  return { id, title, url, source: source_ as KnowledgeSource, updated }
}

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

const trimEnd = (text: string) => text.replace(/\s+$/, '')

/**
 * Removes HTML comments before anything else looks at the body.
 *
 * A knowledge file has two audiences: the model, and whoever is editing
 * the file. Notes for the editor — "replace the TODO line below", "keep
 * this in Matt's voice" — are instructions about the authoring process,
 * and sending them to the model is both noise and a way for stray `TODO`
 * text to reach the prompt. Anything inside `<!-- -->` is for the editor
 * and never leaves the repo. The denylist check still greps the raw file,
 * so a comment is not a place to hide something private.
 */
function stripComments(body: string): string {
  const stripped = body.replace(/<!--[\s\S]*?-->[ \t]*\r?\n?/g, '')
  if (stripped.includes('<!--')) {
    throw new Error(
      'knowledge: an unterminated <!-- comment would ship to the model; close it'
    )
  }
  return stripped
}

/**
 * True when a body is something Matt actually wrote, rather than empty or
 * still a `TODO` placeholder. Applied to the lead-in text as well as to
 * each `##` block: a file's intro is no more publishable than its
 * questions while it still says TODO.
 */
function isAnswered(body: string): boolean {
  const trimmed = body.trim()
  return trimmed !== '' && !UNANSWERED.test(trimmed)
}

/** Everything before the first `##` heading, then one entry per heading. */
function splitBlocks(body: string): { intro: string; blocks: Block[] } {
  const lines = body.split(/\r?\n/)
  const introLines: string[] = []
  const blocks: Block[] = []
  let current: { heading: string; lines: string[] } | null = null

  for (const line of lines) {
    if (BLOCK_HEADING.test(line)) {
      if (current) {
        blocks.push({
          heading: current.heading,
          body: current.lines.join('\n'),
        })
      }
      current = { heading: line, lines: [] }
      continue
    }
    if (current) current.lines.push(line)
    else introLines.push(line)
  }
  if (current) {
    blocks.push({ heading: current.heading, body: current.lines.join('\n') })
  }

  return { intro: introLines.join('\n').trim(), blocks }
}

/**
 * Drops every `##` block whose answer is missing or still a `TODO`. A file
 * that had blocks and has none left contributes no section at all, so an
 * FAQ Matt has not written yet is simply absent from the prompt rather
 * than present and empty.
 */
function readKnowledgeFile(
  filePath: string,
  source: string
): KnowledgeFile | null {
  const contents = fs.readFileSync(filePath, 'utf8')
  const match = FRONTMATTER_BLOCK.exec(contents)
  if (!match) {
    throw new Error(
      `${source}: no frontmatter block found (expected --- fences at the top)`
    )
  }
  const frontmatter = parseFrontmatter(match[1], source)
  const body = stripComments(contents.slice(match[0].length))

  const { intro, blocks } = splitBlocks(body)
  const answered = blocks.filter(block => isAnswered(block.body))
  if (blocks.length > 0 && answered.length === 0) return null

  // Each surviving block keeps the spacing it was written with; only the
  // dropped ones change the file. That is what lets the guards assert the
  // résumé and blog sections still read byte for byte like the public
  // pages they were copied from.
  const parts = [
    isAnswered(intro) ? intro : '',
    ...answered.map(block => `${block.heading}\n${trimEnd(block.body)}`),
  ]
  const text = parts.filter(part => part !== '').join('\n\n')
  if (text === '') return null

  return { frontmatter, text }
}

/**
 * Non-blog sections in their fixed order, then blog posts newest first.
 * Same-day posts fall back to id so the order cannot depend on readdir.
 */
function orderFiles(files: KnowledgeFile[]): KnowledgeFile[] {
  const fixed: KnowledgeFile[] = []
  const blog: KnowledgeFile[] = []
  for (const file of files) {
    const { id } = file.frontmatter
    if (SECTION_ORDER.includes(id)) fixed.push(file)
    else if (id.startsWith(BLOG_PREFIX)) blog.push(file)
    else
      throw new Error(
        `content/knowledge/${id}.md: unknown section "${id}". Add it to SECTION_ORDER in lib/knowledge/build.ts or name it ${BLOG_PREFIX}<slug>.md.`
      )
  }
  fixed.sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.frontmatter.id) -
      SECTION_ORDER.indexOf(b.frontmatter.id)
  )
  blog.sort((a, b) => {
    if (a.frontmatter.updated !== b.frontmatter.updated) {
      return a.frontmatter.updated < b.frontmatter.updated ? 1 : -1
    }
    return a.frontmatter.id < b.frontmatter.id ? -1 : 1
  })
  return [...fixed, ...blog]
}

function renderSection(section: KnowledgeSection): string {
  return [
    `<section id="${section.id}" title="${section.title}" url="${section.url}">`,
    section.text,
    '</section>',
  ].join('\n')
}

/**
 * Token estimate: characters divided by four, rounded up.
 *
 * It is a heuristic, not a tokenizer. English prose runs about four
 * characters per token across the tokenizers in use, and this text is
 * English prose with some URLs, which tokenize worse. It is used only to
 * decide whether the knowledge base still fits comfortably in a prompt, so
 * a rough number that never needs a model-specific dependency is the right
 * trade. Treat it as an order-of-magnitude check, not a budget.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Reads content/knowledge and returns the assistant's whole world.
 *
 * `dir` and `ceiling` are here for the guards in knowledge.test.ts; the
 * chat route calls loadKnowledgeBase() in index.ts and passes neither.
 * Throws on any authoring error (bad frontmatter, unknown section, text
 * over the ceiling) so a broken knowledge base fails loudly at load rather
 * than quietly shipping a truncated or mis-ordered prompt.
 */
export function buildKnowledgeBase(
  dir: string = KNOWLEDGE_DIR,
  ceiling: number = KNOWLEDGE_TOKEN_CEILING
): KnowledgeBase {
  const names = fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.md') && !name.startsWith('_'))
    .sort()
  if (names.length === 0) {
    throw new Error(
      `${dir}: no knowledge files found; the assistant would have nothing to read`
    )
  }

  const files: KnowledgeFile[] = []
  for (const name of names) {
    const file = readKnowledgeFile(
      path.join(dir, name),
      path.join('content', 'knowledge', name)
    )
    if (file) files.push(file)
  }

  if (files.length === 0) {
    throw new Error(
      `${dir}: every knowledge file is empty or still a TODO; the assistant would have nothing to read`
    )
  }

  const seen = new Set<string>()
  for (const file of files) {
    const { id } = file.frontmatter
    if (seen.has(id)) throw new Error(`content/knowledge: duplicate id "${id}"`)
    seen.add(id)
  }

  // Built field by field, not spread: `updated` orders the blog sections
  // and then stays behind, so a KnowledgeSection is exactly the five
  // fields the chat route's contract promises.
  const sections: KnowledgeSection[] = orderFiles(files).map(file => ({
    id: file.frontmatter.id,
    title: file.frontmatter.title,
    url: file.frontmatter.url,
    source: file.frontmatter.source,
    text: file.text,
  }))
  const text = sections.map(renderSection).join('\n\n')
  const tokenEstimate = estimateTokens(text)

  if (tokenEstimate > ceiling) {
    throw new Error(
      `content/knowledge is too large for the prompt: ~${tokenEstimate} tokens against a ceiling of ${ceiling}. Trim a section or raise KNOWLEDGE_TOKEN_CEILING deliberately.`
    )
  }

  return { text, sections, tokenEstimate, builtAt: new Date().toISOString() }
}
