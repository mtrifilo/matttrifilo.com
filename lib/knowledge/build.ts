import fs from 'fs'
import path from 'path'
import { MAX_HEADING_CHARS, MAX_HEADINGS } from '@/lib/chat/progress'

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

/**
 * The topic directories, in the order they appear in the index: most
 * generally useful first, the long tail of blog posts last.
 *
 * Topics are a closed set on purpose. Adding a *document* must stay a
 * one-file change Matt can make without touching code — that is the whole
 * point of this layout — but adding a whole new *kind* of knowledge is a
 * decision about what the assistant is for, and it should be made here,
 * on purpose, rather than by whatever a directory happens to be called.
 *
 * This list is also the only definition of `source`. They used to be two
 * fields with the same five values and nothing asserting they agreed,
 * which let a document in career/ declare itself the résumé.
 *
 * Exported so lib/chat/progress.test.ts can hold its client-safe copy of
 * this list against it: the progress wire names a step's topic, and the
 * browser cannot import this module.
 */
export const TOPIC_ORDER = [
  'resume',
  'career',
  'faq',
  'open-source',
  'blog',
] as const

/**
 * The topic a document lives in. It keeps the name `source` because that
 * is the chat route's contract; it is derived from the directory rather
 * than declared in frontmatter, so the two cannot disagree.
 */
export type KnowledgeSource = (typeof TOPIC_ORDER)[number]

function isTopic(name: string): name is KnowledgeSource {
  return (TOPIC_ORDER as readonly string[]).includes(name)
}

const topicIndex = (topic: string): number =>
  (TOPIC_ORDER as readonly string[]).indexOf(topic)

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
  /**
   * The document's `##` section titles, in document order (MTC-50).
   *
   * On the entry object and never in the rendered index: the model is shown
   * a catalogue line and chooses a document from its summary, while these
   * are for the progress view, which tells the visitor what the assistant
   * opened. A document with no sections has none.
   *
   * Read-only because the corpus is built once per process: this one array
   * is handed to every request that names the document, so a sort or a
   * splice anywhere downstream would corrupt the index for the rest of the
   * process rather than for one answer.
   */
  headings?: readonly string[]
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
  /** faq questions dropped for still being a TODO, so a build can say so. */
  unanswered: UnansweredQuestion[]
  /** faq files dropped whole, for the same reason. */
  droppedDocuments: string[]
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

/**
 * The most tokens one document may cost to read.
 *
 * A document is the unit the model fetches, so an oversized one quietly
 * eats a whole turn's budget and crowds out the other two reads
 * KNOWLEDGE_READ_BUDGET allows. Splitting it is almost always the better
 * answer: two focused documents are easier for the model to choose
 * between than one long one, and that is the point of the index.
 *
 * 9,000, and the reasoning is worth writing down because the tidy answer
 * is wrong. maxTokens / maxDocuments is 6,666, which would reject the
 * essay in blog/ — ~7,900 tokens, one published piece that should not be
 * chopped into three to satisfy a constant. 8,000 accepts it by 74 tokens,
 * which is not a ceiling, it is a tripwire: the next typo fix in that post
 * breaks the build. 9,000 is the value that gives the one genuinely large
 * document real headroom while still leaving a realistic turn well inside
 * budget — one big document plus two career documents at the size Matt's
 * actually are (~2,500 tokens) is ~14,000 against 20,000.
 *
 * That means three documents at the ceiling would be 27,000, over budget.
 * So this is deliberately not the only guard: `bun run knowledge:check`
 * fails on the *actual* worst-case three-document read, which is the
 * number that matters and the one that will move as the corpus grows.
 */
export const KNOWLEDGE_DOCUMENT_TOKEN_CEILING = 9_000

export const KNOWLEDGE_DIR = path.join(process.cwd(), 'content', 'knowledge')

const FRONTMATTER_BLOCK = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/
const FRONTMATTER_FIELD = /^([A-Za-z]+):[ \t]*(.*)$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** A `##` heading, and only `##` — `###` and deeper stay inside a block. */
const BLOCK_HEADING = /^## (?!#)/
/**
 * What a placeholder looks like, as opposed to the word "TODO" appearing
 * in something Matt wrote.
 *
 * A career document about how his team works may well mention TODO
 * comments in code; rejecting the bare word anywhere would make that
 * unpublishable for no reason. A placeholder is the thing that stands
 * where prose should be: a line that *starts* with TODO (after an optional
 * list marker), or the literal marker faq.md uses.
 *
 * These shapes are applied to a line only through findBlockPlaceholder,
 * which is the one rule for a block: the faq drop, the build-time refusal
 * in every other topic, and the backstop in knowledge.test.ts that checks
 * the text as it ships all reach it, so they cannot disagree.
 */
const PLACEHOLDER_LINE = /^[ \t]*(?:(?:[-*+]|\d+\.)[ \t]+)?TODO\b/
const PLACEHOLDER_MARKER = /TODO \(Matt\)/

function isPlaceholder(line: string): boolean {
  return PLACEHOLDER_LINE.test(line) || PLACEHOLDER_MARKER.test(line)
}

/** A summary is a line in the index, so it has to stay one short line. */
export const SUMMARY_MAX_LENGTH = 160

interface Frontmatter {
  id: string
  title: string
  summary: string
  tags: string[]
  updated: string
  canonical?: string
}

/**
 * Every key a document may declare. `source` is not among them: it is the
 * topic directory. An unknown key is an error rather than something
 * ignored, because the failure mode of a silently ignored `sumary:` is a
 * document that loads and is wrong.
 */
const FRONTMATTER_KEYS: readonly string[] = [
  'id',
  'title',
  'summary',
  'tags',
  'updated',
  'canonical',
]

/**
 * `canonical` says "the public original of this document lives here". It
 * can only be a page Matt controls: a canonical pointing somewhere else
 * hands another site the search ranking for his own words.
 */
const CANONICAL_HOST = /^https:\/\/(?:www\.)?matttrifilo\.com(?=[/?#]|$)/

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
    if (!FRONTMATTER_KEYS.includes(match[1])) {
      throw new Error(
        `${source}: unknown frontmatter key "${match[1]}". A document declares ${FRONTMATTER_KEYS.join(', ')} and nothing else; its topic comes from the directory it is in.`
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
  const updated = required('updated')
  const canonical = fields.get('canonical')

  if (id !== expectedId) {
    throw new Error(
      `${source}: id "${id}" must match the file name ("${expectedId}"), so the id the model reads in the index names the file on disk`
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
  if (canonical !== undefined && !CANONICAL_HOST.test(canonical)) {
    throw new Error(
      `${source}: canonical must be an https://matttrifilo.com URL — it is where the original of this document is published, not a citation (got "${canonical}")`
    )
  }

  return {
    id,
    title,
    summary,
    tags,
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
 * A stretch of a document: the introduction before the first `##` heading
 * (heading null), or one `##` heading and the lines under it. The heading
 * is part of the block because it is prose too: the model reads it, and
 * the progress view shows it to the visitor.
 */
interface Block {
  heading: SourceLine | null
  lines: SourceLine[]
}

/** A block that starts at a `##` heading. */
interface Section extends Block {
  heading: SourceLine
}

/** A heading's title: the line without its `## `. */
function headingTitle(heading: SourceLine): string {
  return heading.text.replace(BLOCK_HEADING, '').trim()
}

/** A block's lines under its heading, joined back into text. */
function blockBody(block: Block): string {
  return block.lines.map(line => line.text).join('\n')
}

/** An opening or closing ``` / ~~~ fence, with any indent and info string. */
const CODE_FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/

/**
 * Tracks whether a line is inside a fenced code block.
 *
 * Markdown closes a fence only with the same character, at least as long
 * as the opener, and with no info string — so a ``` inside a ~~~~ block is
 * content, not a close. Callers feed lines in order and read `inCode`
 * before deciding what a line means.
 */
class FenceTracker {
  private fence: string | null = null

  /** True when this line is inside a fence (the fence lines themselves count). */
  consume(line: string): boolean {
    const match = CODE_FENCE.exec(line)
    if (!match) return this.fence !== null
    const [, marker, info] = match
    if (this.fence === null) {
      this.fence = marker
      return true
    }
    const closes =
      marker[0] === this.fence[0] &&
      marker.length >= this.fence.length &&
      info.trim() === ''
    if (closes) this.fence = null
    return true
  }

  get open(): boolean {
    return this.fence !== null
  }
}

/**
 * Everything before the first `##` heading, then one section per heading.
 *
 * A `##` inside a fenced code block is a comment in someone's shell
 * snippet, not a section: treating it as a boundary would split the block
 * and orphan the fence, which is how a document ends up rendering as one
 * long code block or failing to render at all. It follows that every block
 * starts outside a fence, so a block can be read on its own.
 */
function splitBlocks(lines: readonly SourceLine[]): {
  intro: Block
  sections: Section[]
} {
  const intro: Block = { heading: null, lines: [] }
  const sections: Section[] = []
  let current: Block = intro
  const fence = new FenceTracker()

  for (const line of lines) {
    const inCode = fence.consume(line.text)
    if (!inCode && BLOCK_HEADING.test(line.text)) {
      const section: Section = { heading: line, lines: [] }
      sections.push(section)
      current = section
      continue
    }
    current.lines.push(line)
  }

  return { intro, sections }
}

/**
 * The `##` section titles of one document, in order, for the progress view
 * (MTC-50).
 *
 * Read off the text the tool would hand the model, so the faq's dropped
 * questions are not listed as sections of it. Titles only: a heading is a
 * few words the author wrote to label a section, and nothing under it comes
 * along.
 *
 * The caps come from the progress wire contract rather than being chosen
 * here, so the build can never emit a heading that lib/chat/progress.ts
 * would drop on arrival. One past either cap is skipped rather than
 * truncated, the same way an over-long document title is.
 */
export function documentHeadings(text: string): string[] {
  const headings: string[] = []
  for (const section of splitBlocks(sourceLines(text)).sections) {
    const heading = headingTitle(section.heading)
    if (heading === '' || heading.length > MAX_HEADING_CHARS) continue
    headings.push(heading)
    if (headings.length === MAX_HEADINGS) break
  }
  return headings
}

/** An inline code span: one or more backticks, matching run to close. */
const INLINE_CODE = /(`+)(?:(?!\1)[\s\S])*?\1/g

/**
 * A Markdown backslash escape. Blanked before anything else looks at a
 * line, for two reasons that point the same way: an escaped backtick does
 * not open a code span (so `` \`a <Thing> b\` `` is prose, and the tag in
 * it is real), and an escaped `\<` is already the correct way to write a
 * literal angle bracket in MDX (so it is not an offence).
 */
const MD_ESCAPE = /\\[\s\S]/g

/**
 * The part of a line MDX will parse as content: escapes and inline code
 * removed. Both checks below read a line through this, so they agree on
 * what counts as code.
 */
function visibleProse(line: string): string {
  return line.replace(MD_ESCAPE, '').replace(INLINE_CODE, '')
}

/**
 * A fence CommonMark would accept inside a nested list item but this
 * check's 3-space rule does not. Tracked only so an error can say so:
 * recognising it properly means tracking list context, which is a Markdown
 * parser, and the corpus has no nested code blocks to justify one.
 */
const OVER_INDENTED_FENCE = /^[ \t]{4,}(?:`{3,}|~{3,})/

/** A line of a document, numbered as it is numbered in the file itself. */
export interface SourceLine {
  text: string
  number: number
}

/**
 * The body line by line, with anything inside an HTML comment blanked out
 * and every line still carrying its real line number in the file.
 *
 * The checks below run against the body rather than the shipped text so
 * they can say "a-role.md:42" and mean it. Comments are blanked rather
 * than removed for the same reason: an author reads the number off this
 * message and opens the file at that line. Comments never ship, so
 * nothing inside one is any of these checks' business.
 */
export function sourceLines(body: string, lineOffset = 0): SourceLine[] {
  const lines: SourceLine[] = []
  let inComment = false
  for (const [i, raw] of body.split(/\r?\n/).entries()) {
    let text = raw
    if (inComment) {
      const end = text.indexOf('-->')
      if (end === -1) {
        lines.push({ text: '', number: lineOffset + i + 1 })
        continue
      }
      text = text.slice(end + 3)
      inComment = false
    }
    text = text.replace(/<!--[\s\S]*?-->/g, '')
    const opens = text.indexOf('<!--')
    if (opens !== -1) {
      text = text.slice(0, opens)
      inComment = true
    }
    lines.push({ text, number: lineOffset + i + 1 })
  }
  return lines
}

/**
 * Refuses a body that would not survive being compiled as MDX.
 *
 * Nothing serves a corpus document, so most of them are never compiled. The
 * blog twins are: each is byte-identical to a post under content/blog, which
 * /blog/[slug] renders through the MDX pipeline, and every page on this site
 * is prerendered, so one stray `<` in one post does not break one page, it
 * fails the build for the whole site. `{` is worse than that:
 * `{process.env.SOMETHING}` is not a syntax error, it is a valid expression
 * that MDX evaluates on the server and prints onto a public page.
 *
 * The rule is applied to every document rather than to the twins alone, so
 * that a document moved into blog/ later cannot carry a build break in with
 * it, and so that the corpus stays renderable without a fresh audit.
 *
 * So both characters are refused outright outside code, including the
 * autolink form `<https://example.com>` (also an MDX error) and anything
 * that reads as a tag. The fix an author wants is almost always a pair of
 * backticks; `&lt;` and `&#123;` work where the character must be literal
 * prose. Fenced blocks and inline code spans are exempt because MDX does
 * not parse their contents — an indented code block is *not* exempt, so
 * use a fence.
 *
 * The rule is every line of the file, not only the lines that ship: a
 * document has to be safe to render whichever of its sections survive,
 * and one rule is easier to hold than two.
 *
 * Known limitation, deliberate: a fence must be indented at most three
 * spaces to be recognised as code. CommonMark allows a deeper indent
 * inside a nested list item, and honouring that means tracking list
 * context — a Markdown parser, for a case the corpus does not have. The
 * cost is a false positive, never a false negative, and the error says so
 * when an over-indented fence is in the document.
 */
function assertMdxSafe(lines: readonly SourceLine[], label: string): void {
  const fence = new FenceTracker()
  let sawOverIndentedFence = false
  for (const line of lines) {
    if (fence.consume(line.text)) continue
    if (OVER_INDENTED_FENCE.test(line.text)) sawOverIndentedFence = true
    const offence = /[<{]/.exec(visibleProse(line.text))
    if (!offence) continue
    const char = offence[0]
    const advice =
      char === '<'
        ? 'wrap it in backticks, or write &lt; — a bare < starts a JSX tag in MDX, and an autolink <https://…> is an MDX error too'
        : 'wrap it in backticks, or write &#123; — a bare { starts a JavaScript expression that MDX evaluates on the server rather than printing'
    // Only mentioned when something actually failed: a deeply indented
    // fence is legal and common, and most of the time it is not the cause.
    const indentNote = sawOverIndentedFence
      ? ' (this document also has a ``` fence indented four or more spaces, which this check does not recognise as code — outdent it to three spaces or fewer)'
      : ''
    throw new Error(
      `${label}:${line.number}: "${char}" outside code would break the MDX build for every page on the site; ${advice}${indentNote}. Line: ${line.text.trim()}`
    )
  }
  if (fence.open) {
    throw new Error(
      `${label}: a fenced code block is never closed; MDX would swallow the rest of the document`
    )
  }
}

/**
 * The one topic where an unfinished section is dropped instead of failing
 * the build.
 *
 * faq.md ships its questions before their answers exist, on purpose: the
 * list of questions is the plan, and the build hides the ones Matt has not
 * written yet. That is a deletion, and a silent deletion is only tolerable
 * because in this one file it is the documented workflow.
 *
 * Everywhere else it would be a trap. A `career/` document is written
 * elsewhere, approved, and pasted in whole; if a stray placeholder let the
 * build quietly delete a section from the model's copy, the failure would
 * look like nothing at all: exit 0, no output, and a document that is merely
 * missing a paragraph nobody can see is missing.
 */
const UNANSWERED_TOPIC = 'faq'

/** A faq question the build dropped because its answer is still a TODO. */
export interface UnansweredQuestion {
  file: string
  heading: string
}

/** A placeholder found in a document: the line, and the section it is in. */
export interface FoundPlaceholder {
  line: SourceLine
  heading: string | null
}

/**
 * The first placeholder in one block, heading first, or null. This is the
 * one rule for whether a block is unfinished; nothing decides it from the
 * body alone.
 *
 * The heading is checked because it is prose a visitor can be shown: the
 * progress view lists a document's section titles under its row, so an
 * editor's note written as a heading is a placeholder even when the
 * section under it is finished.
 *
 * Reads each line the way MDX will (fenced blocks skipped, escapes and
 * inline code removed), so `// TODO` inside a ```` ``` ```` block and a
 * `` `TODO` `` written about in prose are both left alone. What it looks
 * for is a placeholder's *shape* (isPlaceholder), not the word. A block
 * always starts outside a fence (splitBlocks), so reading one alone sees
 * the same fences as reading the whole document.
 */
function findBlockPlaceholder(block: Block): SourceLine | null {
  if (block.heading) {
    const title = headingTitle(block.heading)
    if (isPlaceholder(visibleProse(title))) return block.heading
  }
  const fence = new FenceTracker()
  for (const line of block.lines) {
    if (fence.consume(line.text)) continue
    if (isPlaceholder(visibleProse(line.text))) return line
  }
  return null
}

/**
 * The first placeholder in a document, or null: findBlockPlaceholder over
 * the introduction and then each section.
 *
 * Exported because knowledge.test.ts runs it over the shipped text as a
 * backstop, and the two must agree on what a placeholder is.
 */
export function findPlaceholder(
  lines: readonly SourceLine[]
): FoundPlaceholder | null {
  const { intro, sections } = splitBlocks(lines)
  const introLine = findBlockPlaceholder(intro)
  if (introLine) return { line: introLine, heading: null }
  for (const section of sections) {
    const line = findBlockPlaceholder(section)
    if (line) return { line, heading: headingTitle(section.heading) }
  }
  return null
}

/**
 * Refuses a placeholder in a topic that does not drop them, naming the
 * line and the section it is under so the fix is obvious.
 */
function assertNoPlaceholder(
  lines: readonly SourceLine[],
  label: string
): void {
  const found = findPlaceholder(lines)
  if (!found) return
  throw new Error(
    `${label}:${found.line.number}: a TODO placeholder under "${found.heading ?? 'the introduction'}". Only content/knowledge/${UNANSWERED_TOPIC} drops unfinished sections; everywhere else a placeholder is a build error, so a section can never be deleted from the model's copy without anyone noticing. Finish it, delete it, or move it inside an HTML comment.`
  )
}

/**
 * True when a block is something Matt actually wrote: it has a body, and
 * neither its heading nor its body is a placeholder. Applied to the
 * lead-in text as well as to each `##` section: a file's intro is no more
 * publishable than its questions while it still says TODO.
 */
function isAnswered(block: Block): boolean {
  return blockBody(block).trim() !== '' && findBlockPlaceholder(block) === null
}

/**
 * The faq's text: every `##` section whose answer is missing, or whose
 * heading or answer is a placeholder, is dropped, and the headings that
 * were dropped are reported so `bun run knowledge:check` can print them
 * rather than leaving the deletion invisible. A file that had sections and
 * has none left contributes no document at all, so an FAQ Matt has not
 * written yet is simply absent from the index rather than present and
 * empty.
 */
function readAnsweredBlocks(
  body: string,
  label: string
): { text: string; unanswered: UnansweredQuestion[] } {
  const { intro, sections } = splitBlocks(sourceLines(body))
  const answered = sections.filter(isAnswered)
  const unanswered = sections
    .filter(section => !isAnswered(section))
    .map(section => ({ file: label, heading: headingTitle(section.heading) }))
  if (sections.length > 0 && answered.length === 0) {
    return { text: '', unanswered }
  }

  // Each surviving section keeps the spacing it was written with; only the
  // dropped ones change the file.
  const parts = [
    isAnswered(intro) ? blockBody(intro).trim() : '',
    ...answered.map(
      section => `${section.heading.text}\n${trimEnd(blockBody(section))}`
    ),
  ]
  return { text: parts.filter(part => part !== '').join('\n\n'), unanswered }
}

/**
 * Reads one document. Returns no document when the faq is still entirely
 * unanswered; throws for anything that is an authoring mistake rather than
 * a documented state.
 */
function readDocument(
  filePath: string,
  topic: KnowledgeSource,
  label: string
): { document: KnowledgeDocument | null; unanswered: UnansweredQuestion[] } {
  const contents = fs.readFileSync(filePath, 'utf8')
  const match = FRONTMATTER_BLOCK.exec(contents)
  if (!match) {
    throw new Error(
      `${label}: no frontmatter block found (expected --- fences at the top)`
    )
  }
  const expectedId = path.basename(filePath, '.md')
  const frontmatter = parseFrontmatter(match[1], label, expectedId)
  const raw = contents.slice(match[0].length)
  const body = stripComments(raw)

  // Checked against the raw body, so an error can cite the line number the
  // author will open the file at rather than one counted from wherever the
  // frontmatter happened to end.
  const lineOffset = (match[0].match(/\n/g) ?? []).length
  const lines = sourceLines(raw, lineOffset)
  assertMdxSafe(lines, label)

  // Outside the faq, the body ships exactly as written. That is not only
  // safer than reassembling it — it is what makes "the résumé document is
  // the published résumé, verbatim" true by construction rather than by
  // the reassembly happening to round-trip.
  let text: string
  let unanswered: UnansweredQuestion[] = []
  if (topic === UNANSWERED_TOPIC) {
    ;({ text, unanswered } = readAnsweredBlocks(body, label))
    // The documented drop: an faq with nothing answered yet is absent
    // rather than present and empty.
    if (text === '') return { document: null, unanswered }
  } else {
    assertNoPlaceholder(lines, label)
    text = body.trim()
    // Not a drop. A file with a frontmatter block and no body is a paste
    // that went wrong, and returning null here would take it out of the
    // index the model is shown, with exit 0 and nothing printed.
    if (text === '') {
      throw new Error(
        `${label}: the body is empty; only content/knowledge/${UNANSWERED_TOPIC} drops documents, so this would otherwise vanish from the index and the site without a word. Write it, or delete the file.`
      )
    }
  }

  const tokenEstimate = estimateTokens(text)
  const headings = documentHeadings(text)
  if (tokenEstimate > KNOWLEDGE_DOCUMENT_TOKEN_CEILING) {
    throw new Error(
      `${label}: ~${tokenEstimate} tokens against a per-document ceiling of ${KNOWLEDGE_DOCUMENT_TOKEN_CEILING}. Split this document: it is one of the handful the model may read in a turn (KNOWLEDGE_READ_BUDGET), and at this size it crowds the others out. Two focused documents are also easier for it to choose between, which is what the index is for.`
    )
  }

  return {
    document: {
      id: frontmatter.id,
      title: frontmatter.title,
      summary: frontmatter.summary,
      tags: frontmatter.tags,
      topic,
      source: topic,
      tokenEstimate,
      ...(headings.length > 0 ? { headings } : {}),
      ...(frontmatter.canonical ? { canonical: frontmatter.canonical } : {}),
      text,
      updated: frontmatter.updated,
    },
    unanswered,
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
      return topicIndex(a.topic) - topicIndex(b.topic)
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
function findDocumentFiles(
  dir: string
): { file: string; topic: KnowledgeSource }[] {
  const found: { file: string; topic: KnowledgeSource }[] = []
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
    if (!isTopic(topic)) {
      throw new Error(
        `content/knowledge/${topic}: unknown topic (known: ${TOPIC_ORDER.join(', ')}). A new topic is a decision about what the assistant is for, so it is added by hand: TOPIC_ORDER in lib/knowledge/build.ts, which decides where it sits in the index and is also the "source" a document reports.`
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
 * anyway, and holding the parsed corpus is what lets ./index answer
 * readKnowledgeDocument from a Map it builds over these documents, rather
 * than from a path built out of a caller's string. "On demand" is about
 * what reaches the model's context, not about what reaches memory — a few
 * hundred short Markdown files is a few megabytes.
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
  const unanswered: UnansweredQuestion[] = []
  const droppedDocuments: string[] = []
  for (const { file, topic } of files) {
    const label = path.join('content', 'knowledge', topic, path.basename(file))
    const read = readDocument(file, topic, label)
    unanswered.push(...read.unanswered)
    if (read.document) documents.push(read.document)
    else droppedDocuments.push(label)
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
        `content/knowledge: duplicate id "${document.id}" in ${previous} and ${document.topic}; the model reads one document per id`
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
    ...(document.headings ? { headings: document.headings } : {}),
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
    unanswered,
    droppedDocuments,
  }
}
