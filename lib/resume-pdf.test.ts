import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { extractPdfText, pdfPageCount } from './pdf-text'

// The hosted résumé is a redacted export of a private source. These
// assertions are the only mechanical guard that a re-export did not bring
// the phone number or personal email back onto a public, indexed URL.
const pdf = fs.readFileSync(
  path.join(process.cwd(), 'public', 'Matt-Trifilo-Resume.pdf')
)
const text = extractPdfText(pdf)
const md = fs.readFileSync(
  path.join(process.cwd(), 'content', 'resume.md'),
  'utf8'
)

describe('public résumé PDF', () => {
  test('text extraction works (positive control)', () => {
    expect(text).toContain('Matt Trifilo')
    expect(text).toContain('hi@matttrifilo.com')
  })

  test('contains no phone number', () => {
    expect(text).not.toMatch(/\d{3}[-. ()]*\d{3}[-. ()]*\d{4}/)
    expect(text).not.toMatch(/\+1[\s-]?\d/)
  })

  test('contains no personal email; the only address is the site contact', () => {
    expect(text).not.toMatch(/gmail|yahoo|hotmail|outlook|icloud|proton/i)
    const addresses = [...new Set(text.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [])]
    expect(addresses).toEqual(['hi@matttrifilo.com'])
  })

  test('raw bytes carry no personal address or tel: link either', () => {
    const raw = pdf.toString('latin1')
    expect(raw).not.toMatch(/gmail\.com|tel:/i)
    expect(raw).not.toMatch(/\/Author/)
  })

  test('contains no ZIP or street address', () => {
    expect(text).not.toMatch(/\b\d{5}(-\d{4})?\b/)
    expect(text).not.toMatch(
      /\b\d+ [A-Z][a-z]+ (St|Ave|Rd|Blvd|Dr|Ln|Way|Ct)\b/
    )
  })

  test('was rendered from the same content/resume.md the page renders', () => {
    // extractPdfText drops the space at each line wrap, so compare with all
    // whitespace and Markdown punctuation removed.
    // Heading labels are uppercased by CSS in the PDF, so compare
    // case-insensitively as well.
    const squash = (s: string) =>
      s.replace(/[*_`#[\]()\s·•—–-]/g, '').toLowerCase()
    const pdfText = squash(text)
    for (const line of md.split('\n')) {
      const n = squash(line)
      if (n.length < 40) continue
      expect(pdfText).toContain(n)
    }
  })

  test('carries every heading, including the role and sub-group lines', () => {
    // Short lines escape the length floor above, and the pipeline's h4/h5
    // support lives in a script outside this repo, so check headings
    // explicitly: a regenerated PDF must not drop them or print them raw.
    const headings = md.split('\n').filter(line => /^#{1,6} /.test(line))
    expect(headings.length).toBeGreaterThan(8)
    const lower = text.toLowerCase()
    for (const heading of headings) {
      expect(lower).toContain(heading.replace(/^#+ /, '').toLowerCase())
    }
    // Extracted text is one line per page, so a line-anchored check would
    // never fire; the PDF text contains no `#` at all when rendering works.
    expect(text).not.toContain('#')
  })

  test('is the two pages the /resume page promises', () => {
    expect(pdfPageCount(pdf)).toBe(2)
  })
})
