import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { buildMessages, SYSTEM_PROMPT } from '@/lib/chat/prompt'
import { loadKnowledgeIndex } from '@/lib/knowledge'
import { findEmDashes, findPunctuationDashes } from './dashes'

/**
 * No em dash in anything the site shows a visitor, or tells the model.
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
 * - lib/chat/answer.ts and lib/chat/validate.ts (the notices and fallbacks
 *   the chat shows as sent) and content/open-source.ts (the repository
 *   summaries), the same way.
 * - every file under content/knowledge/, whole. HTML comments count there:
 *   the build strips them before the model reads a document, but the
 *   repository is public.
 * - content/resume.md, and any .md or .mdx file under the script
 *   directories above, whole.
 *
 * Not read: content/blog/, which is Matt's own writing and his to police.
 *
 * What an em dash is, entities and look-alike characters included, is
 * lib/dashes.ts, shared with the eval assertion that checks the assistant's
 * answers and with the knowledge build. The en dash is allowed here: the résumé's date ranges use it.
 */

const ROOT = join(import.meta.dir, '..')

const SOURCE_DIRECTORIES = ['app', 'components', 'lib/og', 'lib/seo']
const SOURCE_FILES = [
  'lib/chat/prompt.ts',
  'lib/chat/answer.ts',
  'lib/chat/validate.ts',
  'content/open-source.ts',
]
const CONTENT_DIRECTORIES = ['content/knowledge']
const CONTENT_FILES = ['content/resume.md']

interface Finding {
  file: string
  line: number
  excerpt: string
}

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

function sourceFindings(path: string): Finding[] {
  const source = readFileSync(join(ROOT, path), 'utf8')
  return renderableText(source, path).flatMap(piece =>
    findEmDashes(piece.text).map(hit => ({
      file: path,
      line: piece.line + lineOffset(piece.text, hit.index),
      excerpt: hit.excerpt,
    }))
  )
}

function contentFindings(path: string): Finding[] {
  const text = readFileSync(join(ROOT, path), 'utf8')
  return findEmDashes(text).map(hit => ({
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
    expect(sourcePaths.flatMap(sourceFindings)).toEqual([])
  })

  test('the corpus and the résumé', () => {
    expect(contentPaths.flatMap(contentFindings)).toEqual([])
  })

  test('the policy as the model receives it', () => {
    // Stricter than the files: a spaced en dash in the policy is a sentence
    // dash the model would copy, and the policy has no ranges to excuse.
    expect(findPunctuationDashes(SYSTEM_PROMPT)).toEqual([])
  })

  test('the messages a request sends the model', () => {
    // A prior turn is included so the transcript frame is rendered too.
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
    // A context that lost the index would pass the scan below for nothing.
    expect(context).toContain(SYSTEM_PROMPT)
    expect(context).toContain(index.text)
    // Punctuation dashes, as for the policy: a spaced en dash here is a
    // sentence dash the model would copy, and a range in a summary passes.
    expect(findPunctuationDashes(context)).toEqual([])
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
