import fs from 'fs'
import path from 'path'

/**
 * Builds the career assistant's corpus: a small index the model always
 * sees, and the verbatim documents it fetches one at a time.
 *
 * The shape is deliberate, and it is the shape a Claude Code plugin uses.
 * An earlier version concatenated every file into one block of prompt
 * text, which put a ceiling on how much Matt could write: every new
 * document cost every request. Here the index carries one line per
 * document — id, title, one-sentence summary, tags, size — and the model
 * asks for the one to three documents a question actually needs. The
 * corpus can grow to hundreds of documents without the prompt growing
 * with it.
 *
 * The one rule this file exists to enforce is unchanged: the assistant's
 * only source is content/knowledge/<topic>/<id>.md, which is written for
 * the public. Nothing here reaches outside that directory, and nothing
 * fetches anything at build or request time.
 *
 * index.ts is the module the chat route imports; it holds the memoised
 * loader and the read budget. The build lives here so the guards in
 * knowledge.test.ts can rebuild on demand (byte-stability) and against a
 * fixture directory (ceiling enforcement) without reaching into the cache
 * the route depends on.
 */

export type KnowledgeSource =
  'resume' | 'blog' | 'open-source' | 'career' | 'faq'

/**
 * One line in the index: everything the model needs to decide whether
 * this document is worth spending a read on, and nothing else.
 */
export interface KnowledgeEntry {
  id: string
  title: string
  summary: string
  tags: string[]
  topic: string
  source: KnowledgeSource
  /** Tokens the document body would cost to read; see estimateTokens. */
  tokenEstimate: number
  /** Where the document is published on this site: `/knowledge/${id}`. */
  url: string
  /** The public original, when the document is a copy of one. */
  canonical?: string
}

/** An entry plus the text itself, as fetched by id. */
export interface KnowledgeDocument extends KnowledgeEntry {
  /** The body: frontmatter removed, HTML comments stripped. */
  text: string
  updated: string
}

export interface KnowledgeIndex {
  entries: KnowledgeEntry[]
  /** The rendered index, ready to drop into a prompt. */
  text: string
  tokenEstimate: number
  builtAt: string
}

export interface KnowledgeCorpus {
  index: KnowledgeIndex
  documents: KnowledgeDocument[]
}

/**
 * The most tokens the index may occupy in a prompt. The index is in every
 * request, so it is the number that has to stay small; a document read is
 * paid for only by the turn that asks for it.
 *
 * 8k leaves the index room for a few hundred documents at ~25 tokens a
 * line while staying a rounding error next to the system prompt and the
 * conversation. The build throws rather than silently sending a prompt
 * that no longer fits. The companion budget on the read side is
 * KNOWLEDGE_READ_BUDGET in ./index.
 */
export const KNOWLEDGE_INDEX_TOKEN_CEILING = 8_000

export const KNOWLEDGE_DIR = path.join(process.cwd(), 'content', 'knowledge')

const SOURCES: readonly KnowledgeSource[] = [
  'resume',
  'blog',
  'open-source',
  'career',
  'faq',
]

/**
 * The topic directories, in the order they appear in the index: most
 * generally useful first, the long tail of blog posts last.
 *
 * Topics are a closed set on purpose. Adding a *document* must stay a
 * one-file change Matt can make without touching code — that is the whole
 * point of this layout — but adding a whole new *kind* of knowledge is a
 * decision about what the assistant is for, and it should be made here,
 * on purpose, rather than by whatever a directory happens to be called.
 */
const TOPIC_ORDER: readonly string[] = [
  'resume',
  'career',
  'faq',
  'open-source',
  'blog',
]

const FRONTMATTER_BLOCK = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/
const FRONTMATTER_FIELD = /^([A-Za-z]+):[ \t]*(.*)$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** A `##` heading, and only `##` — `###` and deeper stay inside a block. */
const BLOCK_HEADING = /^## (?!#)/
/**
 * A body still waiting on Matt. faq.md ships its questions with `TODO
 * (Matt)` bodies; those blocks are dropped so a placeholder never reaches
 * the model, and knowledge.test.ts asserts no `TODO` survives the build.
 */
const UNANSWERED = /^TODO\b/

/** A summary is a line in the index, so it has to stay one short line. */
export const SUMMARY_MAX_LENGTH = 160

interface Frontmatter {
  id: string
  title: string
  summary: string
  tags: string[]
  source: KnowledgeSource
  updated: string
  canonical?: string
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
 * `[a, b, c]` — the only list form the frontmatter accepts.
 *
 * A YAML block list (`- a` on its own line) is rejected one level up, by
 * FRONTMATTER_FIELD, with a message naming the offending line. One way to
 * write a list is easier to read across a hundred files than two.
 */
function parseTags(raw: string, source: string): string[] {
  const value = raw.trim()
  if (!value.startsWith('[') || !value.endsWith(']')) {
    throw new Error(
      `${source}: tags must be an inline list, [a, b] (got "${raw}")`
    )
  }
  const tags = value
    .slice(1, -1)
    .split(',')
    .map(tag => unquote(tag))
    .filter(tag => tag !== '')
  if (tags.length === 0) {
    throw new Error(
      `${source}: tags may not be empty; they are how the model narrows the index`
    )
  }
  for (const tag of tags) {
    // The index renders tags as `tags: a, b`, so a tag carrying one of the
    // separators would read back as two tags.
    if (/[,;\]\r\n]/.test(tag)) {
      throw new Error(
        `${source}: a tag may not contain a comma, semicolon, bracket or newline (got "${tag}")`
      )
    }
  }
  return tags
}

/**
 * Reads the frontmatter by hand rather than through a YAML parser. YAML
 * turns an unquoted `updated: 2026-03-01` into a JS Date in a local
 * timezone, and the whole point of this build is that its output is
 * byte-identical every time it runs, on any machine.
 */
function parseFrontmatter(
  raw: string,
  source: string,
  expectedId: string
): Frontmatter {
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
  const summary = required('summary')
  const tags = parseTags(fields.get('tags') ?? '', source)
  const source_ = required('source')
  const updated = required('updated')
  const canonical = fields.get('canonical')

  if (id !== expectedId) {
    throw new Error(
      `${source}: id "${id}" must match the file name ("${expectedId}"), so ids stay stable and /knowledge/<id> keeps resolving`
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
  if (summary.length > SUMMARY_MAX_LENGTH) {
    throw new Error(
      `${source}: summary is ${summary.length} characters; keep it to ${SUMMARY_MAX_LENGTH} so the index stays one line per document`
    )
  }
  // The title and summary are rendered into an index line as
  // `- [id] title — summary (…)`. Refuse the two characters that would
  // make that line ambiguous rather than escaping them, so a prompt dump
  // stays something a human can read.
  for (const [key, value] of [
    ['title', title],
    ['summary', summary],
  ] as const) {
    if (/[\r\n]/.test(value)) {
      throw new Error(`${source}: ${key} must be one line (got "${value}")`)
    }
    if (value.includes('—')) {
      throw new Error(
        `${source}: ${key} may not contain an em dash; the index uses it to separate the title from the summary (got "${value}")`
      )
    }
  }
  if (canonical !== undefined && !canonical.startsWith('https://')) {
    throw new Error(
      `${source}: canonical must be an https:// URL (got "${canonical}")`
    )
  }

  return {
    id,
    title,
    summary,
    tags,
    source: source_ as KnowledgeSource,
    updated,
    ...(canonical ? { canonical } : {}),
  }
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

interface Block {
  heading: string
  body: string
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
 * Reads one document, dropping every `##` block whose answer is missing or
 * still a `TODO`. A file that had blocks and has none left contributes no
 * document at all, so an FAQ Matt has not written yet is simply absent
 * from the index rather than present and empty.
 */
function readDocument(
  filePath: string,
  topic: string,
  label: string
): KnowledgeDocument | null {
  const contents = fs.readFileSync(filePath, 'utf8')
  const match = FRONTMATTER_BLOCK.exec(contents)
  if (!match) {
    throw new Error(
      `${label}: no frontmatter block found (expected --- fences at the top)`
    )
  }
  const expectedId = path.basename(filePath, '.md')
  const frontmatter = parseFrontmatter(match[1], label, expectedId)
  const body = stripComments(contents.slice(match[0].length))

  const { intro, blocks } = splitBlocks(body)
  const answered = blocks.filter(block => isAnswered(block.body))
  if (blocks.length > 0 && answered.length === 0) return null

  // Each surviving block keeps the spacing it was written with; only the
  // dropped ones change the file. That is what lets the guards assert the
  // résumé and blog documents still read byte for byte like the public
  // pages they were copied from.
  const parts = [
    isAnswered(intro) ? intro : '',
    ...answered.map(block => `${block.heading}\n${trimEnd(block.body)}`),
  ]
  const text = parts.filter(part => part !== '').join('\n\n')
  if (text === '') return null

  return {
    id: frontmatter.id,
    title: frontmatter.title,
    summary: frontmatter.summary,
    tags: frontmatter.tags,
    topic,
    source: frontmatter.source,
    tokenEstimate: estimateTokens(text),
    url: `/knowledge/${frontmatter.id}`,
    ...(frontmatter.canonical ? { canonical: frontmatter.canonical } : {}),
    text,
    updated: frontmatter.updated,
  }
}

/**
 * Topics in TOPIC_ORDER; inside a topic, most recently updated first, ties
 * broken by id. Nothing here may depend on readdir order: the index text
 * is asserted byte-stable, and a reordered prompt is a changed prompt.
 */
function orderDocuments(documents: KnowledgeDocument[]): KnowledgeDocument[] {
  return [...documents].sort((a, b) => {
    if (a.topic !== b.topic) {
      return TOPIC_ORDER.indexOf(a.topic) - TOPIC_ORDER.indexOf(b.topic)
    }
    if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1
    return a.id < b.id ? -1 : 1
  })
}

/** `- [id] title — summary (tags: a, b; ~N tokens)` */
function renderEntry(entry: KnowledgeEntry): string {
  return `- [${entry.id}] ${entry.title} — ${entry.summary} (tags: ${entry.tags.join(', ')}; ~${entry.tokenEstimate} tokens)`
}

/**
 * The index as the model sees it: a `## topic` heading per group, one line
 * per document underneath.
 *
 * Nothing here tells the model what to do with it. How to ask for a
 * document, how many to ask for, what to do when none of them fit — that
 * is the chat route's prompt to write, and keeping it out of this module
 * means the corpus and the conversation can change independently.
 */
function renderIndex(entries: KnowledgeEntry[]): string {
  const groups: string[] = []
  for (const topic of TOPIC_ORDER) {
    const inTopic = entries.filter(entry => entry.topic === topic)
    if (inTopic.length === 0) continue
    groups.push([`## ${topic}`, ...inTopic.map(renderEntry)].join('\n'))
  }
  return groups.join('\n\n')
}

/**
 * Token estimate: characters divided by four, rounded up.
 *
 * It is a heuristic, not a tokenizer. English prose runs about four
 * characters per token across the tokenizers in use, and this text is
 * English prose with some URLs, which tokenize worse. It is used only to
 * decide whether the index still fits comfortably in a prompt and to give
 * the model a sense of what a read will cost, so a rough number that never
 * needs a model-specific dependency is the right trade. Treat it as an
 * order-of-magnitude check, not a budget.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** The `.md` files under `dir`, one topic directory deep, sorted. */
function findDocumentFiles(dir: string): { file: string; topic: string }[] {
  const found: { file: string; topic: string }[] = []
  for (const entry of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isDirectory()) {
      if (entry.name.endsWith('.md')) {
        throw new Error(
          `content/knowledge/${entry.name}: documents live in a topic directory, content/knowledge/<topic>/${entry.name}`
        )
      }
      continue
    }
    const topic = entry.name
    if (!TOPIC_ORDER.includes(topic)) {
      throw new Error(
        `content/knowledge/${topic}: unknown topic. Add it to TOPIC_ORDER in lib/knowledge/build.ts, deciding where it belongs in the index.`
      )
    }
    const names = fs
      .readdirSync(path.join(dir, topic))
      .filter(name => name.endsWith('.md') && !name.startsWith('_'))
      .sort()
    for (const name of names) {
      found.push({ file: path.join(dir, topic, name), topic })
    }
  }
  return found
}

/**
 * Reads content/knowledge and returns the index plus every document.
 *
 * Everything is parsed once, here: the index needs each document's size
 * anyway, and holding the parsed corpus means readKnowledgeDocument is a
 * map lookup rather than a path built from a caller's string. "On demand"
 * is about what reaches the model's context, not about what reaches
 * memory — a few hundred short Markdown files is a few megabytes.
 *
 * `dir` and `ceiling` are here for the guards in knowledge.test.ts; the
 * site calls the loaders in ./index and passes neither. Throws on any
 * authoring error (bad frontmatter, unknown topic, an index over the
 * ceiling) so a broken corpus fails loudly at load rather than quietly
 * shipping a truncated or mis-ordered prompt.
 */
export function buildKnowledgeCorpus(
  dir: string = KNOWLEDGE_DIR,
  ceiling: number = KNOWLEDGE_INDEX_TOKEN_CEILING
): KnowledgeCorpus {
  const files = findDocumentFiles(dir)
  if (files.length === 0) {
    throw new Error(
      `${dir}: no knowledge documents found; the assistant would have nothing to read`
    )
  }

  const documents: KnowledgeDocument[] = []
  for (const { file, topic } of files) {
    const label = path.join('content', 'knowledge', topic, path.basename(file))
    const document = readDocument(file, topic, label)
    if (document) documents.push(document)
  }

  if (documents.length === 0) {
    throw new Error(
      `${dir}: every knowledge document is empty or still a TODO; the assistant would have nothing to read`
    )
  }

  const seen = new Map<string, string>()
  for (const document of documents) {
    const previous = seen.get(document.id)
    if (previous !== undefined) {
      throw new Error(
        `content/knowledge: duplicate id "${document.id}" in ${previous} and ${document.topic}; /knowledge/${document.id} can only be one of them`
      )
    }
    seen.set(document.id, document.topic)
  }

  const ordered = orderDocuments(documents)
  // Built field by field, not spread: `text` and `updated` order and size
  // the entries and then stay behind, so a KnowledgeEntry is exactly what
  // the index promises.
  const entries: KnowledgeEntry[] = ordered.map(document => ({
    id: document.id,
    title: document.title,
    summary: document.summary,
    tags: document.tags,
    topic: document.topic,
    source: document.source,
    tokenEstimate: document.tokenEstimate,
    url: document.url,
    ...(document.canonical ? { canonical: document.canonical } : {}),
  }))

  const text = renderIndex(entries)
  const tokenEstimate = estimateTokens(text)
  if (tokenEstimate > ceiling) {
    throw new Error(
      `the knowledge index is too large for the prompt: ~${tokenEstimate} tokens against a ceiling of ${ceiling}. Shorten some summaries or raise KNOWLEDGE_INDEX_TOKEN_CEILING deliberately.`
    )
  }

  return {
    index: { entries, text, tokenEstimate, builtAt: new Date().toISOString() },
    documents: ordered,
  }
}
