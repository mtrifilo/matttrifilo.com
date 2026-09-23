import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'

/**
 * Module-specifier strings in a source file: static imports and re-exports,
 * side-effect imports, dynamic `import()`, and `require()`. Read off the
 * text rather than a resolved graph, which is enough for the two rules below
 * because both are about what a file names directly.
 */
function importedSpecifiers(source: string): string[] {
  const pattern =
    /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
  return Array.from(source.matchAll(pattern), match => match[1])
}

function specifiersIn(file: string): string[] {
  return importedSpecifiers(fs.readFileSync(file, 'utf8'))
}

const LIB = path.join(process.cwd(), 'lib')

describe('progress caps layering', () => {
  test('the specifier reader sees every import form it claims to', () => {
    const source = [
      "import { a } from '@/lib/chat/progress'",
      "import type { B } from '../chat/answer'",
      "export { c } from './sibling'",
      "import 'side-effect'",
      "const d = await import('@/lib/chat/handler')",
      "const e = require('./required')",
    ].join('\n')
    expect(importedSpecifiers(source)).toEqual([
      '@/lib/chat/progress',
      '../chat/answer',
      './sibling',
      'side-effect',
      '@/lib/chat/handler',
      './required',
    ])
  })

  test('nothing under lib/knowledge imports from the chat layer', () => {
    // The chat route depends on the corpus, so the corpus depending on the
    // chat layer would make the two one tangle. The heading caps both need
    // live in lib/progress-caps for that reason. Tests are exempt: they
    // hold the two layers' copies of a contract against each other, which
    // means importing both.
    const dir = path.join(LIB, 'knowledge')
    const modules = fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter(
        name =>
          /\.[cm]?[jt]sx?$/.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name)
      )
    expect(modules).toContain('build.ts')
    for (const name of modules) {
      const chatImports = specifiersIn(path.join(dir, name)).filter(specifier =>
        /(^|\/)chat(\/|$)/.test(specifier)
      )
      expect({ module: name, chatImports }).toEqual({
        module: name,
        chatImports: [],
      })
    }
  })

  test('the caps module imports nothing', () => {
    // lib/chat/progress.ts is in the browser bundle and imports the caps,
    // so anything this module imported would ship to every visitor.
    expect(specifiersIn(path.join(LIB, 'progress-caps.ts'))).toEqual([])
  })

  test('the progress wire imports only the caps and a type', () => {
    // Its header promises the browser one runtime import. './answer' is
    // listed because the reader cannot tell `import type` apart, and it is
    // a type-only import there.
    expect(specifiersIn(path.join(LIB, 'chat', 'progress.ts'))).toEqual([
      '@/lib/progress-caps',
      './answer',
    ])
  })
})
