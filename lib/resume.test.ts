import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { hardBreaks, linkify } from './resume'

const md = fs.readFileSync(
  path.join(process.cwd(), 'content', 'resume.md'),
  'utf8'
)

describe('content/resume.md (published copy)', () => {
  test('is redacted: no phone number, no personal email, no street address', () => {
    expect(md).not.toMatch(/\d{3}[-. ()]*\d{3}[-. ()]*\d{4}/)
    expect(md).not.toMatch(/\+1[ -]?\d/)
    expect(md).not.toMatch(/gmail|yahoo|hotmail|outlook|icloud|proton/i)
    const addresses = [...new Set(md.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [])]
    expect(addresses).toEqual(['hi@matttrifilo.com'])
    expect(md).not.toMatch(/\b\d{5}(-\d{4})?\b/) // ZIP
    expect(md).not.toMatch(/\b\d+ [A-Z][a-z]+ (St|Ave|Rd|Blvd|Dr|Ln|Way|Ct)\b/) // street
  })

  test('has no MDX-hostile characters', () => {
    // `{` and `<` would be parsed as expressions/JSX by MDXRemote.
    expect(md).not.toMatch(/[{<]/)
  })

  test('starts with the name heading', () => {
    expect(md.split('\n')[0]).toBe('# Matt Trifilo')
  })
})

describe('linkify', () => {
  test('links emails and the allowlisted hosts, leaves headings and existing links alone', () => {
    expect(
      linkify(
        'hi@matttrifilo.com · linkedin.com/in/matttrifilo · matttrifilo.com'
      )
    ).toBe(
      '[hi@matttrifilo.com](mailto:hi@matttrifilo.com) · [linkedin.com/in/matttrifilo](https://linkedin.com/in/matttrifilo) · [matttrifilo.com](https://matttrifilo.com)'
    )
    expect(linkify('Psychic Homily (psychichomily.com): site')).toBe(
      'Psychic Homily ([psychichomily.com](https://psychichomily.com)): site'
    )
    expect(linkify('# github.com/mtrifilo')).toBe('# github.com/mtrifilo')
    expect(linkify('[x](https://github.com/a)')).toBe(
      '[x](https://github.com/a)'
    )
  })

  test('does not link filenames, versions, or domains outside the allowlist', () => {
    for (const s of [
      'Next.js and Vue.js',
      'next.config.dev',
      'v1.net to v2.org',
      'tooling.dev scripts',
      'resilience4j 1.5.0',
    ]) {
      expect(linkify(s)).toBe(s)
    }
  })
})

describe('hardBreaks', () => {
  test('keeps the header block on separate lines', () => {
    expect(hardBreaks('# Name\na · b\nc · d\nlast\n\nnext · x\nmore')).toBe(
      '# Name\na · b  \nc · d  \nlast\n\nnext · x\nmore'
    )
  })
  test('ignores " · " lines outside the header block', () => {
    expect(hardBreaks('# Name\n\n**Role · 2025**\n- bullet')).toBe(
      '# Name\n\n**Role · 2025**\n- bullet'
    )
  })
})
