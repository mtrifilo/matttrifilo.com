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

  test('is the two pages the /resume page promises', () => {
    expect(pdfPageCount(pdf)).toBe(2)
  })
})
