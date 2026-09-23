import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { SYSTEM_PROMPT } from '@/lib/chat/prompt'
import { findEmDashes, findPunctuationDashes } from './dashes'

/**
 * No em dash in anything the site shows a visitor, or tells the model.
 *
 * The files this reads:
 * - every .ts and .tsx file under app/ and components/, test files excepted,
 *   which includes components/assistant/copy.ts. Only the text those files
 *   can render is read: string literals, template literals and JSX text,
 *   with escapes and HTML entities resolved. Comments are never read.
 * - lib/chat/prompt.ts, the same way, and SYSTEM_PROMPT as the model
 *   receives it, so a constant the policy interpolates from another file is
 *   covered too.
 * - every file under content/knowledge/, whole. HTML comments count there:
 *   the build strips them before the model reads a document, but the
 *   repository is public.
 * - content/resume.md, whole.
 *
 * What an em dash is, entities and look-alike characters included, is
 * lib/dashes.ts, shared with the eval assertion that checks the assistant's
 * answers. The en dash is allowed here: the résumé's date ranges use it.
 */

const ROOT = join(import.meta.dir, '..')

const SOURCE_DIRECTORIES = ['app', 'components']
const SOURCE_FILES = ['lib/chat/prompt.ts']
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

function isScannedSource(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)
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
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
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
  ...CONTENT_FILES,
]

describe('no em dash anywhere a visitor reads', () => {
  test('the scan reaches the files it names', () => {
    // A path that moved would otherwise leave this guard reading nothing
    // and passing.
    expect(sourcePaths).toContain('components/assistant/copy.ts')
    expect(sourcePaths).toContain('components/assistant/assistant-composer.tsx')
    expect(sourcePaths).toContain('lib/chat/prompt.ts')
    expect(sourcePaths.some(path => path.startsWith('app/'))).toBe(true)
    expect(contentPaths).toContain('content/resume.md')
    expect(
      contentPaths.filter(path => path.startsWith('content/knowledge/')).length
    ).toBeGreaterThan(1)
    expect(sourcePaths.some(path => /\.test\.tsx?$/.test(path))).toBe(false)
  })

  test('the source under app/ and components/, and the policy file', () => {
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
