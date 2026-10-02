import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/**
 * No inline font size in the source under app/ or components/.
 *
 * An inline font size outranks every class, so a heading sized that way
 * cannot be restyled from the stylesheet, and the same clamp ends up copied
 * page to page. Headings take a size from a class instead: Tailwind's scale,
 * or the fluid sizes in app/globals.css (text-display, text-page-title,
 * text-section-title).
 *
 * Every script file there, test files excepted (a test may stub a computed
 * style), is parsed, and these fail:
 * - an object property named fontSize, font-size or font (the shorthand
 *   sets the size too), plain, quoted or computed from a string, in JSX or
 *   in a style object built anywhere in the file;
 * - an assignment to `.style.fontSize`, `.style.font` or
 *   `.style['font-size']`, and `.style.setProperty('font-size' | 'font', …)`.
 * Comments and strings are never read, and reading a size
 * (`getComputedStyle(el).fontSize`) is not setting one.
 *
 * Not scanned: lib/, where the social card (lib/og/) is drawn by an image
 * renderer that takes inline styles only.
 */

const root = fileURLToPath(new URL('..', import.meta.url))
const scanned = ['app', 'components']
const scriptFile = /\.[cm]?[jt]sx?$/
const testFile = /\.test\.[cm]?[jt]sx?$/
const fontSizeNames = new Set(['fontSize', 'font-size', 'font'])

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFilesUnder(path)
    return scriptFile.test(entry.name) && !testFile.test(entry.name)
      ? [path]
      : []
  })
}

/** The name a property or element access spells out, if it is literal. */
function literalName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text
  if (ts.isComputedPropertyName(node)) return literalName(node.expression)
  return undefined
}

/** `x.style.<name>` or `x.style['<name>']`: the name, else undefined. */
function styleMember(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    const owner = node.expression
    return ts.isPropertyAccessExpression(owner) && owner.name.text === 'style'
      ? node.name.text
      : undefined
  }
  if (ts.isElementAccessExpression(node)) {
    const owner = node.expression
    return ts.isPropertyAccessExpression(owner) && owner.name.text === 'style'
      ? literalName(node.argumentExpression)
      : undefined
  }
  return undefined
}

function setsFontSize(node: ts.Node): boolean {
  if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
    return fontSizeNames.has(literalName(node.name) ?? '')
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    return fontSizeNames.has(styleMember(node.left) ?? '')
  }
  if (
    ts.isCallExpression(node) &&
    styleMember(node.expression) === 'setProperty'
  ) {
    const [property] = node.arguments
    return (
      property !== undefined && fontSizeNames.has(literalName(property) ?? '')
    )
  }
  return false
}

/** Line numbers, 1-based, of every inline font size in the source. */
function inlineFontSizes(fileName: string, source: string): number[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    /x$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const lines: number[] = []
  const visit = (node: ts.Node) => {
    if (setsFontSize(node)) {
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
    const files = scanned.flatMap(dir => sourceFilesUnder(join(root, dir)))
    // A scan that found nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(50)
    const hits = files.flatMap(path =>
      inlineFontSizes(path, readFileSync(path, 'utf8')).map(
        line => `${relative(root, path)}:${line}`
      )
    )
    expect(hits).toEqual([])
  })

  test('the finder sees each form a font size takes', () => {
    const source = [
      "const a = <h1 style={{ fontSize: 'clamp(1rem, 2vw, 3rem)' }} />",
      "const b = { 'fontSize': 12 }",
      'const c = { fontSize }',
      "const d = { 'font-size': '3rem' }",
      "const e = { ['fontSize']: 12 }",
      "const f = <p style={{ font: '700 3rem/1 serif' }} />",
      "el.style.fontSize = '3rem'",
      "el.style['font-size'] = '3rem'",
      "el.style.setProperty('font-size', '3rem')",
    ].join('\n')
    expect(inlineFontSizes('sample.tsx', source)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
  })

  test('the finder ignores comments, strings and reads', () => {
    const source = [
      '// fontSize: 12 in a comment',
      "const a = 'fontSize: 12'",
      'const b = el.style.fontSize',
      'const c = getComputedStyle(el).fontSize',
      "const d = el.style.getPropertyValue('font-size')",
    ].join('\n')
    expect(inlineFontSizes('sample.tsx', source)).toEqual([])
  })
})
