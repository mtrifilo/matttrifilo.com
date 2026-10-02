import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'

/**
 * The reading measure (MTC-37): the prose on /resume and blog posts runs
 * about 70 characters to a line at desktop width, and phones are left as
 * they were. The value lives in one utility in app/globals.css; these tests
 * hold what it emits, which element on each page wears it, and that a
 * phone's column is already narrower than it.
 */

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

/** The body text size both pages set on the prose, in px (`text-base`). */
const BODY_PX = 16
/** The narrowest common phone the site is checked at, in CSS px. */
const PHONE_PX = 390

async function emittedMeasure(): Promise<string> {
  const compiled = await compile(css, {
    base: fileURLToPath(new URL('../app', import.meta.url)),
    onDependency: () => {},
  })
  const built = compiled.build(['max-w-measure'])
  const rule = built.match(/\.max-w-measure \{[^}]*\}/)
  if (!rule) throw new Error('.max-w-measure was not generated')
  return optimize(rule[0], { minify: true }).code
}

/** The opening tag of the element that directly wraps `<MDXContent`. */
function wrapperOfMdx(page: string): string {
  const at = page.indexOf('<MDXContent')
  if (at < 0) throw new Error('no <MDXContent in the page')
  const open = page.lastIndexOf('<', at - 1)
  return page.slice(open, page.indexOf('>', open) + 1)
}

describe('the reading measure', () => {
  test('.max-w-measure is max-width 34em and nothing else', async () => {
    // em, not ch: Geist's "0" is far wider than its average character, so
    // 70ch would come out near 100 characters (see app/globals.css).
    expect(await emittedMeasure()).toBe('.max-w-measure{max-width:34em}')
  })

  test.each(['app/resume/page.tsx', 'app/blog/[slug]/page.tsx'])(
    '%s: the element wrapping the Markdown wears it',
    page => {
      const tag = wrapperOfMdx(source(page))
      expect(tag).toMatch(/className="[^"]*\bmax-w-measure\b[^"]*"/)
    }
  )

  test.each(['app/resume/page.tsx', 'app/blog/[slug]/page.tsx'])(
    '%s: a phone column is narrower than the measure',
    page => {
      // The page frame's mobile padding, from its own classes: px-N is
      // N quarter-rems a side.
      const frame = source(page).match(/className="w-full max-w-3xl ([^"]*)"/)
      expect(frame).not.toBeNull()
      const px = frame![1].match(/(?:^|\s)px-(\d+)(?:\s|$)/)
      expect(px).not.toBeNull()
      const gutter = Number(px![1]) * 4
      const phoneColumn = PHONE_PX - 2 * gutter

      const em = Number(
        css.match(/@utility max-w-measure \{\s*max-width: ([\d.]+)em;/)![1]
      )
      expect(phoneColumn).toBeLessThan(em * BODY_PX)
    }
  )
})
