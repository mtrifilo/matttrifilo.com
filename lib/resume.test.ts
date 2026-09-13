import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { hardBreaks, linkify } from './resume'

const md = fs.readFileSync(
  path.join(process.cwd(), 'content', 'resume.md'),
  'utf8'
)

describe('content/resume.md (published copy)', () => {
  test('is redacted: no phone number, no personal email', () => {
    expect(md).not.toMatch(/\d{3}[-. ()]*\d{3}[-. ()]*\d{4}/)
    expect(md).not.toMatch(/gmail|yahoo|hotmail|outlook|icloud|proton/i)
    const addresses = [...new Set(md.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [])]
    expect(addresses).toEqual(['hi@matttrifilo.com'])
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
  test('links emails and bare domains, leaves headings and existing links alone', () => {
    expect(
      linkify(
        'hi@matttrifilo.com · linkedin.com/in/matttrifilo · matttrifilo.com'
      )
    ).toBe(
      '[hi@matttrifilo.com](mailto:hi@matttrifilo.com) · [linkedin.com/in/matttrifilo](https://linkedin.com/in/matttrifilo) · [matttrifilo.com](https://matttrifilo.com)'
    )
    expect(linkify('# github.com/mtrifilo')).toBe('# github.com/mtrifilo')
    expect(linkify('[x](https://a.com)')).toBe('[x](https://a.com)')
    expect(linkify('Next.js and Vue.js front end')).toBe(
      'Next.js and Vue.js front end'
    )
    expect(linkify('Psychic Homily (psychichomily.com): site')).toBe(
      'Psychic Homily ([psychichomily.com](https://psychichomily.com)): site'
    )
  })
})

describe('hardBreaks', () => {
  test('keeps the header block on separate lines', () => {
    expect(hardBreaks('a · b\nc · d\n\nnext')).toBe('a · b  \nc · d\n\nnext')
    expect(hardBreaks('## Heading · x\nbody')).toBe('## Heading · x\nbody')
  })
})
