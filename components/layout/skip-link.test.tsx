import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { render, screen } from '@testing-library/react'
import { FOCUS_RING } from '@/lib/focus-ring'
import { MAIN_CONTENT_ID, SKIP_LINK_LABEL, SkipLink } from './skip-link'

/**
 * The site-wide skip link (Matt, 2026-09-30, MTC-102): the first tab stop on
 * every page, visible on focus, landing on the page's `<main>`.
 *
 * The root layout cannot render here (it loads next/font and the canvas),
 * so its order is read from its JSX, element by element, as the page
 * renders it. Every page, the homepage and /ask among them, is a child of
 * that one `<main>`.
 */

const ROOT = new URL('../../', import.meta.url).pathname
const LAYOUT = join(ROOT, 'app/layout.tsx')

describe('the skip link', () => {
  test('links to the main content by name', () => {
    render(<SkipLink />)
    const link = screen.getByRole('link', { name: SKIP_LINK_LABEL })
    expect(link.getAttribute('href')).toBe(`#${MAIN_CONTENT_ID}`)
  })

  test('sits above the page until it takes focus, then shows its ring', () => {
    render(<SkipLink />)
    const classes = screen
      .getByRole('link', { name: SKIP_LINK_LABEL })
      .className.split(/\s+/)
    expect(classes).toEqual(expect.arrayContaining(['fixed', '-top-24']))
    expect(classes).toContain('focus:top-3')
    expect(classes).toEqual(expect.arrayContaining(FOCUS_RING.split(' ')))
  })
})

/** Each JSX element in a file, in the order the page renders it. */
function jsxElements(
  file: string
): { name: string; attributes: Map<string, string> }[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const elements: { name: string; attributes: Map<string, string> }[] = []
  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : undefined
    if (opening) {
      const attributes = new Map<string, string>()
      for (const property of opening.attributes.properties) {
        if (ts.isJsxAttribute(property) && property.initializer) {
          attributes.set(
            property.name.getText(source),
            property.initializer.getText(source)
          )
        }
      }
      elements.push({ name: opening.tagName.getText(source), attributes })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return elements
}

describe('the root layout', () => {
  // What the page renders before the skip link. None of them can take
  // focus: the document's own elements, the JSON-LD script, the theme
  // provider (a script and its children), the honeycomb canvas, and the
  // column that holds the rest. A new element ahead of the skip link has to
  // be added here, with the reason it cannot take focus.
  const BEFORE_THE_SKIP_LINK = [
    'html',
    'head',
    'JsonLd',
    'body',
    'ThemeProvider',
    'HexBackground',
    'div',
  ]

  test('renders the skip link first, ahead of the nav', () => {
    const names = jsxElements(LAYOUT).map(element => element.name)
    const skipLink = names.indexOf('SkipLink')
    expect(skipLink).toBeGreaterThan(-1)
    expect(names.slice(0, skipLink)).toEqual(BEFORE_THE_SKIP_LINK)
    expect(names.indexOf('Nav')).toBeGreaterThan(skipLink)
  })

  test("gives the skip link's target an id and lets it take focus", () => {
    const main = jsxElements(LAYOUT).find(element => element.name === 'main')
    expect(main?.attributes.get('id')).toBe('{MAIN_CONTENT_ID}')
    expect(main?.attributes.get('tabIndex')).toBe('{-1}')
  })

  test('the target is the one main landmark, around every page', () => {
    // A second `<main>`, in a page or a component, would be a second
    // landmark the skip link does not reach.
    const withMain = sourceFiles(['app', 'components']).filter(file =>
      jsxElements(file).some(element => element.name === 'main')
    )
    expect(withMain).toEqual([LAYOUT])
  })
})

function sourceFiles(directories: readonly string[]): string[] {
  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name))
        files.push(path)
    }
  }
  for (const directory of directories) walk(join(ROOT, directory))
  return files.sort()
}
