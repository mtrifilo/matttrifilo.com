import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { asSchema, type Tool } from 'ai'
import { buildMessages, SYSTEM_PROMPT } from '@/lib/chat/prompt'
import { createReadBudget } from '@/lib/chat/read-budget'
import { createReadDocumentSession } from '@/lib/chat/read-document'
import { createRecentActivitySession } from '@/lib/chat/recent-activity'
import { loadKnowledgeIndex, readKnowledgeDocument } from '@/lib/knowledge'
import { findBritishSpellings } from './american-english'
import { findEmDashes, findPunctuationDashes } from './dashes'

/**
 * No em dash, and no British spelling, in anything the site shows a
 * visitor, or tells the model.
 *
 * The files this reads:
 * - every script file (.ts, .tsx, .js, .jsx and their .mjs/.cjs kin) under
 *   app/, components/, lib/og/ (the social card) and lib/seo/ (page
 *   metadata), test files excepted; components/assistant/copy.ts is one.
 *   Only the text those files can render is read: string literals, template
 *   literals and JSX text, with escapes and HTML entities resolved.
 *   Comments are never read.
 * - lib/chat/prompt.ts, the same way, and SYSTEM_PROMPT as the model
 *   receives it, so a constant the policy interpolates from another file is
 *   covered too.
 * - the messages a request sends the model, rendered by buildMessages over
 *   the index the route loads: the policy, the document index with the
 *   frame and repository list around it, and the visitor's turn. The index
 *   joins corpus text with punctuation the build adds, so no one file holds
 *   it whole.
 * - the tools a request offers the model, built by the same session
 *   factories lib/chat/handler.ts calls: each description and input schema
 *   as the SDK sends them.
 * - lib/chat/answer.ts and lib/chat/validate.ts (the notices and fallbacks
 *   the chat shows as sent), lib/chat/read-document.ts,
 *   lib/chat/recent-activity.ts and lib/chat/github-activity.ts (the tools'
 *   definitions, and the results and activity frame they hand the model)
 *   and content/open-source.ts (the repository summaries), the same way.
 * - every file under content/knowledge/, whole. HTML comments count there:
 *   the build strips them before the model reads a document, but the
 *   repository is public.
 * - content/resume.md, and any .md or .mdx file under the script
 *   directories above, whole.
 * - for spelling only, every string in evals/suites/*.yaml (the questions,
 *   the rubrics and the expected strings), as YAML parses it, so a comment
 *   is never read there either.
 *
 * Not read: content/blog/, which is Matt's own writing and his to police.
 *
 * What an em dash is, entities and look-alike characters included, is
 * lib/dashes.ts, shared with the eval assertion that checks the assistant's
 * answers and with the knowledge build. The file scans allow the en dash,
 * since the résumé's date ranges use it. What the model receives (the
 * policy, the messages, the tools) is held to findPunctuationDashes, which
 * allows an en dash only in a range.
 *
 * What a British spelling is, and the proper nouns and quotations kept as
 * written, is lib/american-english.ts. Both rules read the same files, so
 * neither can reach text the other misses.
 */

const ROOT = join(import.meta.dir, '..')

const SOURCE_DIRECTORIES = ['app', 'components', 'lib/og', 'lib/seo']
const SOURCE_FILES = [
  'lib/chat/prompt.ts',
  'lib/chat/answer.ts',
  'lib/chat/validate.ts',
  'lib/chat/read-document.ts',
  'lib/chat/recent-activity.ts',
  'lib/chat/github-activity.ts',
  'content/open-source.ts',
]
const CONTENT_DIRECTORIES = ['content/knowledge']
const CONTENT_FILES = ['content/resume.md']
const EVAL_SUITE_DIRECTORY = 'evals/suites'

interface Finding {
  file: string
  line: number
  excerpt: string
}

/** What a rule finds in a text: where, and a little of the text around it. */
type Find = (text: string) => { index: number; excerpt: string }[]

/** A British spelling, with the American one in the excerpt. */
const findSpellings: Find = text =>
  findBritishSpellings(text).map(hit => ({
    index: hit.index,
    excerpt: `${hit.word} (American: ${hit.american}) in "${hit.excerpt}"`,
  }))

const excerpts = (find: Find, text: string) =>
  find(text).map(hit => hit.excerpt)

/** Every file under a directory, as a path relative to the repository. */
function filesUnder(directory: string): string[] {
  return readdirSync(join(ROOT, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter(entry => entry.isFile())
    .map(entry => relative(ROOT, join(entry.parentPath, entry.name)))
    .sort()
}

const SCRIPT = /\.[cm]?[jt]sx?$/
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/
const MARKDOWN = /\.mdx?$/

function isScannedSource(path: string): boolean {
  return SCRIPT.test(path) && !TEST_FILE.test(path)
}

/**
 * The text a TypeScript file can put on a page, with the line each piece
 * starts on. The parser, not a pattern, decides what is a comment, so a
 * dash in a comment is never read and a dash in a string is never missed
 * because the line it sits on also carries a comment.
 */
function renderableText(
  source: string,
  fileName: string
): { line: number; text: string }[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    // JSX parses only in the x variants; plain TS reads .js as well.
    /x$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const pieces: { line: number; text: string }[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const start = node.getStart(file)
      pieces.push({
        line: file.getLineAndCharacterOfPosition(start).line + 1,
        text: node.text,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return pieces
}

function sourceFindings(path: string, find: Find): Finding[] {
  const source = readFileSync(join(ROOT, path), 'utf8')
  return renderableText(source, path).flatMap(piece =>
    find(piece.text).map(hit => ({
      file: path,
      line: piece.line + lineOffset(piece.text, hit.index),
      excerpt: hit.excerpt,
    }))
  )
}

function contentFindings(path: string, find: Find): Finding[] {
  const text = readFileSync(join(ROOT, path), 'utf8')
  return find(text).map(hit => ({
    file: path,
    line: 1 + lineOffset(text, hit.index),
    excerpt: hit.excerpt,
  }))
}

/**
 * Lines between the start of a text and a position in it. Close enough for
 * a failure message: an entity decoded before the position shortens the
 * text, and never by a line break.
 */
function lineOffset(text: string, index: number): number {
  return text.slice(0, index).split('\n').length - 1
}

const sourcePaths = [
  ...SOURCE_DIRECTORIES.flatMap(filesUnder).filter(isScannedSource),
  ...SOURCE_FILES,
]
const contentPaths = [
  ...CONTENT_DIRECTORIES.flatMap(filesUnder),
  ...SOURCE_DIRECTORIES.flatMap(filesUnder).filter(path => MARKDOWN.test(path)),
  ...CONTENT_FILES,
]

/**
 * Every string value in a parsed YAML document, with the path to it. Keys
 * are the suite's schema, not text anyone reads.
 */
function yamlStrings(
  value: unknown,
  path: string
): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      yamlStrings(item, `${path}[${index}]`)
    )
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      yamlStrings(item, `${path}.${key}`)
    )
  }
  return []
}

const evalSuitePaths = filesUnder(EVAL_SUITE_DIRECTORY).filter(path =>
  /\.ya?ml$/.test(path)
)

const evalSuiteStrings = evalSuitePaths.flatMap(path =>
  yamlStrings(Bun.YAML.parse(readFileSync(join(ROOT, path), 'utf8')), path)
)

/**
 * The messages a request sends the model, joined, rendered by buildMessages
 * over the index the route loads. A prior turn is included so the
 * transcript frame is rendered too.
 */
function modelContext(): { context: string; indexText: string } {
  const index = loadKnowledgeIndex()
  const context = buildMessages({
    index,
    history: [
      { role: 'user', text: 'Who is Matt?' },
      { role: 'assistant', text: 'An engineering manager.' },
    ],
    userMessage: 'What did he ship?',
  })
    .map(message => message.content)
    .join('\n\n')
  return { context, indexText: index.text }
}

/**
 * The tools a request offers the model, built the way the route builds
 * them, so a constant a description interpolates from another file is
 * covered too. Nothing is executed: the fetch is never called.
 */
async function toolDefinitions(): Promise<
  { description: string; schema: string }[]
> {
  const budget = createReadBudget()
  const tools: Tool[] = [
    createReadDocumentSession({
      entries: loadKnowledgeIndex().entries,
      readKnowledgeDocument,
      budget,
    }).tool,
    createRecentActivitySession({
      fetchActivity: () => Promise.reject(new Error('not called')),
      budget,
    }).tool,
  ]
  return Promise.all(
    tools.map(async tool => ({
      // The SDK also accepts a description computed per call; the route's
      // tools use plain text, and anything else reads as empty and fails
      // the length check rather than going unscanned.
      description: typeof tool.description === 'string' ? tool.description : '',
      schema: JSON.stringify(await asSchema(tool.inputSchema).jsonSchema),
    }))
  )
}

describe('no em dash anywhere a visitor reads', () => {
  test('the scan reaches the files it names', () => {
    // A path that moved would otherwise leave this guard reading nothing
    // and passing.
    expect(sourcePaths).toContain('components/assistant/copy.ts')
    expect(sourcePaths).toContain('components/assistant/assistant-composer.tsx')
    expect(sourcePaths).toContain('lib/chat/prompt.ts')
    expect(sourcePaths).toContain('lib/og/card.tsx')
    expect(sourcePaths).toContain('lib/seo/jsonld.ts')
    expect(sourcePaths.some(path => path.startsWith('app/'))).toBe(true)
    expect(contentPaths).toContain('content/resume.md')
    expect(
      contentPaths.filter(path => path.startsWith('content/knowledge/')).length
    ).toBeGreaterThan(1)
    expect(sourcePaths.some(path => TEST_FILE.test(path))).toBe(false)
  })

  test('the text the scanned source files render', () => {
    expect(
      sourcePaths.flatMap(path => sourceFindings(path, findEmDashes))
    ).toEqual([])
  })

  test('the corpus and the résumé', () => {
    expect(
      contentPaths.flatMap(path => contentFindings(path, findEmDashes))
    ).toEqual([])
  })

  test('the policy as the model receives it', () => {
    // Stricter than the files: a spaced en dash in the policy is a sentence
    // dash the model would copy, and the policy has no ranges to excuse.
    expect(findPunctuationDashes(SYSTEM_PROMPT)).toEqual([])
  })

  test('the messages a request sends the model', () => {
    const { context, indexText } = modelContext()
    // A context that lost the index would pass the scan below for nothing.
    expect(context).toContain(SYSTEM_PROMPT)
    expect(context).toContain(indexText)
    // Punctuation dashes, as for the policy: a spaced en dash here is a
    // sentence dash the model would copy, and a range in a summary passes.
    expect(findPunctuationDashes(context)).toEqual([])
  })

  test('the tools a request offers the model', async () => {
    const definitions = await toolDefinitions()
    // A tool that lost its description would pass the scan for nothing.
    for (const { description, schema } of definitions) {
      expect(description.length).toBeGreaterThan(0)
      expect(schema).toContain('"description"')
      expect(findPunctuationDashes(description)).toEqual([])
      expect(findPunctuationDashes(schema)).toEqual([])
    }
  })
})

describe('no British spelling anywhere a visitor or the model reads', () => {
  test('the scan reaches the eval suites', () => {
    // The file lists above are shared with the em-dash rule, whose first
    // test checks they reach what they name. The suites are this rule's
    // own addition.
    expect(evalSuitePaths).toContain('evals/suites/golden.yaml')
    expect(evalSuitePaths).toContain('evals/suites/refusals.yaml')
    expect(
      evalSuiteStrings.some(
        ({ path, text }) =>
          path.startsWith('evals/suites/golden.yaml') &&
          text.startsWith('The answer')
      )
    ).toBe(true)
  })

  test('the text the scanned source files render', () => {
    expect(
      sourcePaths.flatMap(path => sourceFindings(path, findSpellings))
    ).toEqual([])
  })

  test('the corpus and the résumé', () => {
    expect(
      contentPaths.flatMap(path => contentFindings(path, findSpellings))
    ).toEqual([])
  })

  test('the policy as the model receives it', () => {
    expect(excerpts(findSpellings, SYSTEM_PROMPT)).toEqual([])
  })

  test('the messages a request sends the model', () => {
    const { context, indexText } = modelContext()
    expect(context).toContain(indexText)
    expect(excerpts(findSpellings, context)).toEqual([])
  })

  test('the tools a request offers the model', async () => {
    for (const { description, schema } of await toolDefinitions()) {
      expect(description.length).toBeGreaterThan(0)
      expect(excerpts(findSpellings, description)).toEqual([])
      expect(excerpts(findSpellings, schema)).toEqual([])
    }
  })

  test('the questions, rubrics and expected strings in the eval suites', () => {
    expect(
      evalSuiteStrings.flatMap(({ path, text }) =>
        excerpts(findSpellings, text).map(excerpt => `${path}: ${excerpt}`)
      )
    ).toEqual([])
  })
})

describe('renderableText', () => {
  // Built from code points so this file carries no dash of its own.
  const EM_DASH = String.fromCodePoint(0x2014)
  const BACKSLASH = String.fromCodePoint(0x5c)

  const dashesIn = (source: string, fileName = 'fixture.tsx') =>
    renderableText(source, fileName).flatMap(piece => findEmDashes(piece.text))

  test('reads strings, templates and JSX text', () => {
    for (const source of [
      `const intro = 'Answers ${EM_DASH} email him.'`,
      `const intro = \`Answers ${EM_DASH} \${name}\``,
      `const a = <p>Answers ${EM_DASH} email him.</p>`,
      `const a = <p>{count}{over && \` ${EM_DASH} \${hint}\`}</p>`,
      `const a = <p title="Answers ${EM_DASH} email him" />`,
    ]) {
      expect(dashesIn(source)).toHaveLength(1)
    }
  })

  test('resolves escapes and entities to the dash they render', () => {
    for (const source of [
      `const intro = 'Answers ${BACKSLASH}u2014 email him.'`,
      `const intro = 'Answers ${BACKSLASH}u{2014} email him.'`,
      'const a = <p>Answers &mdash; email him.</p>',
      'const a = <p>Answers &#8212; email him.</p>',
    ]) {
      expect(dashesIn(source)).toHaveLength(1)
    }
  })

  test('never reads a comment', () => {
    for (const source of [
      `// Answers ${EM_DASH} email him.\nconst a = 1`,
      `/* Answers ${EM_DASH} email him. */\nconst a = 1`,
      `/**\n * Answers ${EM_DASH} email him.\n */\nconst a = 1`,
      `const a = 'plain' // trailing ${EM_DASH} note`,
      `const a = <p>{/* Answers ${EM_DASH} email him. */}plain</p>`,
    ]) {
      expect(dashesIn(source)).toEqual([])
    }
  })

  test('reports the line a dash is on', () => {
    const [piece] = renderableText(
      `// one\n\nconst intro = 'Answers ${EM_DASH} email him.'`,
      'fixture.ts'
    )
    expect(piece.line).toBe(3)
  })
})
