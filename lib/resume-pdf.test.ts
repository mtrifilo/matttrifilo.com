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
    const squash = (s: string) => s.replace(/[*_`#[\]()\s·•—–-]/g, '')
    const pdfText = squash(text)
    for (const line of md.split('\n')) {
      const n = squash(line)
      if (n.length < 40) continue
      expect(pdfText).toContain(n)
    }
  })

  test('is the two pages the /resume page promises', () => {
    expect(pdfPageCount(pdf)).toBe(2)
  })
})
