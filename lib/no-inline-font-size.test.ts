import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/**
 * No font size set in a style object under app/ or components/.
 *
 * An inline font size outranks every class, so a heading sized that way
 * cannot be restyled from the stylesheet, and the same clamp ends up copied
 * page to page. Headings take a size from a class instead: Tailwind's scale,
 * or the fluid sizes in app/globals.css (text-display, text-page-title,
 * text-section-title).
 *
 * Every script file is parsed and every object property named fontSize
 * fails, quoted or not, in JSX or in a style object built elsewhere in the
 * file. Comments and strings are never read, so a comment that names the
 * property does not trip it.
 *
 * Not scanned: lib/, where the social card (lib/og/) is drawn by an image
 * renderer that takes inline styles only.
 */

const root = fileURLToPath(new URL('..', import.meta.url))
const scanned = ['app', 'components']
const scriptFile = /\.(ts|tsx|js|jsx|mjs|cjs)$/

function scriptFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return scriptFilesUnder(path)
    return scriptFile.test(entry.name) ? [path] : []
  })
}

/** Line numbers, 1-based, of every property named fontSize in the source. */
function fontSizeProperties(fileName: string, source: string): number[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const lines: number[] = []
  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'fontSize'
    ) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart())
      lines.push(line + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return lines
}

describe('inline font sizes', () => {
  test('none under app/ or components/', () => {
    const files = scanned.flatMap(dir => scriptFilesUnder(join(root, dir)))
    // A scan that found nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(50)
    const hits = files.flatMap(path =>
      fontSizeProperties(path, readFileSync(path, 'utf8')).map(
        line => `${relative(root, path)}:${line}`
      )
    )
    expect(hits).toEqual([])
  })

  test('the finder sees the forms a font size takes, and not a comment', () => {
    const source = [
      "const a = <h1 style={{ fontSize: 'clamp(1rem, 2vw, 3rem)' }} />",
      "const b = { 'fontSize': 12 }",
      'const c = { fontSize }',
      '// fontSize: 12 in a comment',
      "const d = 'fontSize: 12'",
      'const e = el.style.fontSize',
    ].join('\n')
    expect(fontSizeProperties('sample.tsx', source)).toEqual([1, 2, 3])
  })
})
