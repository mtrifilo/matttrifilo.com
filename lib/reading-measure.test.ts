import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'

/**
 * The reading measure (MTC-37): the prose on /resume and blog posts runs
 * about 70 characters to a line at desktop width, and portrait phones keep
 * their layout. The value lives in one utility in app/globals.css; these
 * tests hold what it emits, which element on each page wears it, and that a
 * portrait phone's column is narrower than it.
 */

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const PAGES = ['app/resume/page.tsx', 'app/blog/[slug]/page.tsx']

/** `text-base`, which each wrapper sets and its em measure resolves against. */
const BODY_PX = 16
/** The widest portrait phone in common use (the largest iPhones), CSS px. */
const WIDEST_PORTRAIT_PHONE_PX = 440

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

/** The classes of the element whose first child is `<MDXContent`. */
function wrapperClassesOfMdx(page: string): string[] {
  const wrapper = page.match(/<\w+\s+className="([^"]*)"\s*>\s*<MDXContent\b/)
  if (!wrapper) throw new Error('no element directly wraps <MDXContent')
  return wrapper[1].split(/\s+/)
}

describe('the reading measure', () => {
  test('.max-w-measure is max-width 34em and nothing else', async () => {
    // em, not ch: Geist's "0" is far wider than its average character, so
    // 70ch would come out near 100 characters (see app/globals.css).
    expect(await emittedMeasure()).toBe('.max-w-measure{max-width:34em}')
  })

  test.each(PAGES)(
    '%s: the element wrapping the Markdown wears it, at the body size',
    page => {
      const classes = wrapperClassesOfMdx(source(page))
      expect(classes).toContain('max-w-measure')
      // The measure is in em, so its width in px is only what the comment
      // and the phone test below say while this element is at text-base.
      expect(classes).toContain('text-base')
    }
  )

  test.each(PAGES)(
    '%s: a portrait phone column is narrower than the measure',
    async page => {
      const phoneColumn = WIDEST_PORTRAIT_PHONE_PX - 2 * mobileGutterPx(page)
      expect(phoneColumn).toBeLessThan(await measurePx())
    }
  )

  test('MDX titles balance from the viewport at which the measure binds', async () => {
    // The title renderers in mdx-content.tsx (h2 to h5) balance their lines
    // so a role line or title does not end on a lone word at the measure.
    // Their breakpoint has to sit where the column reaches the measure: any
    // later leaves a band of widths with the measure and without balancing,
    // and any earlier would change portrait phones.
    const mdx = source('components/blog/mdx-content.tsx')
    const rems = [...mdx.matchAll(/min-\[([\d.]+)rem\]:text-balance/g)].map(
      m => m[1]
    )
    expect(rems).toHaveLength(4)
    expect(new Set(rems).size).toBe(1)
    const viewport = Number(rems[0]) * BODY_PX

    // Below md, the column is the viewport less the frame's mobile padding.
    for (const page of PAGES) {
      const column = viewport - 2 * mobileGutterPx(page)
      expect(column).toBeLessThanOrEqual(await measurePx())
    }
    expect(viewport).toBeGreaterThan(WIDEST_PORTRAIT_PHONE_PX)

    // Tailwind turns the arbitrary breakpoint into a min-width query.
    const compiled = await compile(css, {
      base: fileURLToPath(new URL('../app', import.meta.url)),
      onDependency: () => {},
    })
    const built = compiled.build([`min-[${rems[0]}rem]:text-balance`])
    expect(built).toContain(`@media (width >= ${rems[0]}rem)`)
    expect(built).toContain('text-wrap: balance;')
  })
})

/** The page frame's mobile padding a side, from its own classes (px-N). */
function mobileGutterPx(page: string): number {
  const frame = source(page).match(/className="w-full max-w-3xl ([^"]*)"/)
  if (!frame) throw new Error(`no max-w-3xl page frame in ${page}`)
  const px = frame[1].match(/(?:^|\s)px-(\d+)(?:\s|$)/)
  if (!px) throw new Error(`the page frame in ${page} sets no px-N padding`)
  return Number(px[1]) * 4
}

/** The measure in px at the body size, from the compiled rule. */
async function measurePx(): Promise<number> {
  const em = (await emittedMeasure()).match(/max-width:([\d.]+)em/)
  if (!em) throw new Error('the measure is not in em')
  return Number(em[1]) * BODY_PX
}
