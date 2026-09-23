/**
 * The first block in a stylesheet that opens with `opening` (a selector, or
 * an at-rule's prelude), braces balanced, so a rule with a nested block or
 * an at-rule holding several rules comes back whole.
 *
 * Shared by the tests that read app/globals.css as text and the component
 * tests that inject a few of its rules into Happy DOM, so both read the
 * stylesheet the same way.
 */
export function cssBlock(css: string, opening: string): string {
  const start = css.indexOf(opening)
  if (start < 0) throw new Error(`${opening} is not in the stylesheet`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  throw new Error(`${opening} is not closed`)
}
