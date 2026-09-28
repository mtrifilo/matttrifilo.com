import { describe, expect, test } from 'bun:test'
import {
  atxHeading,
  FenceTracker,
  isOverIndentedFence,
  mdxSyntaxText,
  proseText,
} from './markdown'

/**
 * The knowledge build's line reading, held to CommonMark 0.31.2 for each
 * shape MTC-71 lists. The expected values are what a CommonMark parser
 * gives for the same input at the top level of a document.
 */

/** Which lines of a document the tracker reads as fenced code. */
function codeLines(document: string): boolean[] {
  const fence = new FenceTracker()
  return document.split('\n').map(line => fence.consume(line))
}

describe('fenced code blocks', () => {
  test('three or more backticks or tildes open a fence, and a matching run closes it', () => {
    expect(codeLines('```\ncode\n```\nafter')).toEqual([
      true,
      true,
      true,
      false,
    ])
    expect(codeLines('~~~\ncode\n~~~\nafter')).toEqual([
      true,
      true,
      true,
      false,
    ])
    // Two backticks are inline code at most, never a fence.
    expect(codeLines('``\nnot code\n``')).toEqual([false, false, false])
  })

  test('a closer must be at least as long as the opener, of the same character', () => {
    // ```` opens; the ``` inside is content; ```` closes.
    expect(codeLines('````\na\n```\nb\n````\nafter')).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ])
    // A longer closer closes.
    expect(codeLines('```\na\n`````\nafter')).toEqual([true, true, true, false])
    // A ``` inside a ~~~ block is content, and a ~~~ inside ``` is too.
    expect(codeLines('~~~\n```\n~~~\nafter')).toEqual([true, true, true, false])
    expect(codeLines('```\n~~~\n```\nafter')).toEqual([true, true, true, false])
  })

  test('a closer carries nothing after its run but spaces and tabs', () => {
    expect(codeLines('```\nx\n```js\ny\n```\nafter')).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ])
    expect(codeLines('```\nx\n```  \t\nafter')).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  test('a fence may be indented up to three spaces, opener and closer alike', () => {
    expect(codeLines('   ```\nx\n   ```\nafter')).toEqual([
      true,
      true,
      true,
      false,
    ])
    expect(codeLines('```\nx\n  ```\nafter')).toEqual([true, true, true, false])
  })

  test('a fence indented with a tab, or four spaces, is not one at the top level', () => {
    // CommonMark reads a tab as four columns of indentation: an indented
    // code block, whose content is the literal ```. The ``` two lines
    // later then opens a fence of its own.
    expect(codeLines('\t```\nx\n```\nafter')).toEqual([
      false,
      false,
      true,
      true,
    ])
    expect(codeLines('    ```\nx')).toEqual([false, false])
    // A space and then a tab reaches column four too.
    expect(codeLines(' \t```\nx')).toEqual([false, false])
    // Inside an open fence, a closer indented four columns is content.
    expect(codeLines('```\na\n\t```\nb\n```\nafter')).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ])
  })

  test('a backtick fence whose info string holds a backtick is not a fence', () => {
    expect(codeLines('```a`b\nprose\n```\ncode')).toEqual([
      false,
      false,
      true,
      true,
    ])
    // A tilde fence may carry one.
    expect(codeLines('~~~a`b\ncode\n~~~\nafter')).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  test('a fence never closed runs to the end, and says so', () => {
    const fence = new FenceTracker()
    for (const line of ['```ts', 'const x = 1', '', '## not a heading']) {
      expect(fence.consume(line)).toBe(true)
    }
    expect(fence.open).toBe(true)
  })

  test('names a fence indented too far to count, and nothing else', () => {
    expect(isOverIndentedFence('    ```tsx')).toBe(true)
    expect(isOverIndentedFence('\t```')).toBe(true)
    expect(isOverIndentedFence('      ~~~')).toBe(true)
    expect(isOverIndentedFence('   ```')).toBe(false)
    expect(isOverIndentedFence('```')).toBe(false)
    expect(isOverIndentedFence('    ``not a fence')).toBe(false)
    expect(isOverIndentedFence('    ```a`b')).toBe(false)
  })
})

describe('ATX headings', () => {
  test('one to six hashes, then a space, a tab or the end of the line', () => {
    expect(atxHeading('## Title')).toEqual({ level: 2, title: 'Title' })
    expect(atxHeading('### Deeper')).toEqual({ level: 3, title: 'Deeper' })
    expect(atxHeading('# Top')).toEqual({ level: 1, title: 'Top' })
    expect(atxHeading('###### Six')).toEqual({ level: 6, title: 'Six' })
    expect(atxHeading('##\tTab head')).toEqual({ level: 2, title: 'Tab head' })
    expect(atxHeading('#\tTab')).toEqual({ level: 1, title: 'Tab' })
    expect(atxHeading('##')).toEqual({ level: 2, title: '' })
    expect(atxHeading('##Title')).toBeNull()
    expect(atxHeading('####### Seven')).toBeNull()
    expect(atxHeading('#hashtag')).toBeNull()
  })

  test('up to three leading spaces; four columns is indented code', () => {
    expect(atxHeading('   ## Head')).toEqual({ level: 2, title: 'Head' })
    expect(atxHeading(' ### three')).toEqual({ level: 3, title: 'three' })
    expect(atxHeading('    ## four')).toBeNull()
    expect(atxHeading('\t## tab head')).toBeNull()
  })

  test('an optional closing run of hashes is not part of the title', () => {
    expect(atxHeading('## Foo ##')).toEqual({ level: 2, title: 'Foo' })
    expect(atxHeading('## Foo #####   ')).toEqual({ level: 2, title: 'Foo' })
    expect(atxHeading('## #')).toEqual({ level: 2, title: '' })
    // Only after a space or tab: these hashes are the title's own.
    expect(atxHeading('## C#')).toEqual({ level: 2, title: 'C#' })
    expect(atxHeading('## Foo \\#')).toEqual({ level: 2, title: 'Foo \\#' })
  })

  test('the title keeps its inline Markdown for the caller to read', () => {
    expect(atxHeading('## Using `bun test`')).toEqual({
      level: 2,
      title: 'Using `bun test`',
    })
  })
})

describe('escapes and code spans', () => {
  test('a backslash escapes ASCII punctuation and nothing else', () => {
    // `\T` is two characters of text, so the backslash stays.
    expect(proseText('\\TODO (Matt)')).toBe('\\TODO (Matt)')
    expect(proseText('TODO \\(Matt\\)')).toBe('TODO (Matt)')
    expect(proseText('\\- TODO x')).toBe('- TODO x')
    expect(proseText('a \\\\ b')).toBe('a \\ b')
    // A trailing backslash escapes nothing.
    expect(proseText('ends with \\')).toBe('ends with \\')
  })

  test('a code span closes only at a run of exactly the same length', () => {
    expect(proseText('a `code` b')).toBe('a  b')
    expect(proseText('`` `a` ``')).toBe('')
    expect(proseText('``a```b``')).toBe('')
    // A run with no closer of its own length is literal backticks.
    expect(proseText('```TODO (Matt)`')).toBe('```TODO (Matt)`')
    expect(proseText('`a``b')).toBe('`a``b')
  })

  test('an escaped backtick opens nothing, and a backslash in code is literal', () => {
    expect(proseText('\\`TODO (Matt)\\`')).toBe('`TODO (Matt)`')
    // The escape takes one backtick; the next one opens a span.
    expect(proseText('\\``foo`')).toBe('`')
    // Inside a span the backslash is a character, so the span ends at
    // the backtick after it and the rest is prose.
    expect(proseText('`a\\` b')).toBe(' b')
    expect(proseText('a \\\\`b` c')).toBe('a \\ c')
  })

  test('the MDX reading drops escaped characters, which MDX prints', () => {
    expect(mdxSyntaxText('fewer than \\<100, a \\{brace\\}')).toBe(
      'fewer than 100, a brace'
    )
    expect(mdxSyntaxText('`<Thing>` and <b>')).toBe(' and <b>')
    expect(mdxSyntaxText('\\`a <Thing> b\\`')).toBe('a <Thing> b')
    // The span ends at the backslash's backtick, so the tag after it is
    // prose to MDX.
    expect(mdxSyntaxText('`C:\\` and <b> and `x`')).toBe(' and <b> and ')
  })

  test('the worst line for the code-span search stays fast', () => {
    // Runs of every length from 1 to 250, none with a closer: each search
    // reads to the end of the line, about 32,000 characters (a document
    // at the 9,000-token ceiling is 36,000). Pairs of short runs after
    // them close quickly, however many there are.
    const unmatched = Array.from({ length: 250 }, (_, i) =>
      '`'.repeat(i + 1)
    ).join(' x ')
    const started = performance.now()
    expect(proseText(unmatched)).toBe(unmatched)
    expect(proseText('`a` '.repeat(9_000))).toBe(' '.repeat(9_000))
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
