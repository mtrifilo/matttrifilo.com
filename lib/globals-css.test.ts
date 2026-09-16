import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { optimize } from '@tailwindcss/node'

/**
 * Guards for rules in app/globals.css that the build's optimiser can silently
 * change (MTC-36).
 *
 * Every pipeline here runs the CSS through Lightning CSS, which rewrites
 * vendor prefixes from its own browser targets and, when a hand-written
 * `-webkit-` declaration follows the standard one, keeps the prefixed
 * declaration and drops the standard property. That is how the nav's blur
 * shipped for months as `-webkit-backdrop-filter` only, which Chrome does
 * not apply. `bun run build` succeeds either way, so this is the only check
 * that sees the emitted rule.
 *
 * `optimize` is the same function `@tailwindcss/postcss` calls in a
 * production build, on a single extracted rule, so no full compile, no
 * `@import` resolution and no browser are needed.
 */

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

/** The first `selector { … }` block in the stylesheet, braces balanced. */
function ruleFor(selector: string): string {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`${selector} is not in app/globals.css`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  throw new Error(`${selector} is not closed`)
}

const emitted = (rule: string) => optimize(rule, { minify: true }).code

describe('app/globals.css through the build optimiser', () => {
  test('the scrolled nav keeps both backdrop-filter declarations', () => {
    const out = emitted(ruleFor("nav[data-scrolled='true']"))
    expect(out).toContain('backdrop-filter:blur(12px)')
    expect(out).toContain('-webkit-backdrop-filter:blur(12px)')
  })

  test('the hex canvas keeps both mask-image declarations', () => {
    // Wrapped in the media query it lives in, so the rule is optimised as
    // the stylesheet has it.
    const out = emitted(
      `@media (min-width: 56rem) { ${ruleFor('.hex-canvas {')} }`
    )
    expect(out).toContain('mask-image:linear-gradient(')
    expect(out).toContain('-webkit-mask-image:linear-gradient(')
  })

  test('no hand-written vendor prefix sits in the source', () => {
    // The optimiser adds every prefix it needs from its own targets. A
    // hand-written one is at best duplicated bytes and at worst the
    // dropped standard property above.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(declarations).not.toMatch(/-webkit-backdrop-filter/)
    expect(declarations).not.toMatch(/-webkit-mask-image/)
  })

  test('the hazard is real: a hand-written prefix after the standard property loses it', () => {
    const out = emitted(
      'nav{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}'
    )
    expect(out).not.toContain(';backdrop-filter')
    expect(out).toContain('-webkit-backdrop-filter:blur(12px)')
  })
})
