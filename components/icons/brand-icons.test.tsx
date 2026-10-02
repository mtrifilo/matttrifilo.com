import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Mail } from 'lucide-react'
import ContactPage from '@/app/contact/page'
import Home from '@/app/page'
import Footer from '@/components/layout/Footer'
import { Github, Linkedin } from './brand-icons'

const GITHUB_URL = 'https://github.com/mtrifilo'
const LINKEDIN_URL = 'https://linkedin.com/in/matttrifilo'

/**
 * What lucide-react 0.564.0 drew inside each icon's <svg>, written out from
 * that package's dist/esm/icons/github.js and linkedin.js rather than from
 * ./brand-icons, so an edit to the copied nodes fails here.
 */
const GLYPH_0564 = {
  github:
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path>',
  linkedin:
    '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect width="4" height="12" x="2" y="9"></rect><circle cx="4" cy="4" r="2"></circle>',
} as const

const ICONS = [
  [Github, 'github'],
  [Linkedin, 'linkedin'],
] as const

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function iconsIn(doc: Document, href: string, name: string): Element[] {
  return Array.from(
    doc.querySelectorAll(`a[href="${href}"] svg.lucide-${name}`)
  )
}

/** The svg's own attributes, minus the one that names the icon. */
function sharedAttributes(svg: Element): Record<string, string> {
  return Object.fromEntries(
    Array.from(svg.attributes)
      .filter(attribute => attribute.name !== 'class')
      .map(attribute => [attribute.name, attribute.value])
  )
}

function render(element: React.ReactElement): Element {
  const svg = parse(renderToStaticMarkup(element)).querySelector('svg')
  if (!svg) throw new Error('rendered no svg')
  return svg
}

describe('the GitHub and LinkedIn icons where the site shows them', () => {
  // The homepage renders the assistant panel unless the kill switch is set,
  // and the panel needs the app router. The icons are in the hero above it,
  // so turning the panel off leaves what this suite checks unchanged.
  let chatDisabled: string | undefined
  beforeEach(() => {
    chatDisabled = process.env.CHAT_DISABLED
    process.env.CHAT_DISABLED = '1'
  })
  afterEach(() => {
    if (chatDisabled === undefined) delete process.env.CHAT_DISABLED
    else process.env.CHAT_DISABLED = chatDisabled
  })

  const places: [string, () => React.ReactElement][] = [
    ['the homepage', () => <Home />],
    ['the contact page', () => <ContactPage />],
    ['the footer', () => <Footer />],
  ]

  for (const [place, element] of places) {
    test(`${place} draws the 0.564.0 glyph inside each link`, () => {
      const doc = parse(renderToStaticMarkup(element()))
      const github = iconsIn(doc, GITHUB_URL, 'github')
      const linkedin = iconsIn(doc, LINKEDIN_URL, 'linkedin')
      expect(github).toHaveLength(1)
      expect(linkedin).toHaveLength(1)
      expect(github[0].innerHTML).toBe(GLYPH_0564.github)
      expect(linkedin[0].innerHTML).toBe(GLYPH_0564.linkedin)
    })
  }
})

describe('the local brand icons', () => {
  test('get the size, stroke and aria-hidden a lucide icon gets', () => {
    const mail = render(<Mail className="h-4 w-4" />)
    for (const [Icon, name] of ICONS) {
      const svg = render(<Icon className="h-4 w-4" />)
      expect(sharedAttributes(svg)).toEqual(sharedAttributes(mail))
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('class')).toBe(
        mail.getAttribute('class')!.replace('lucide-mail', `lucide-${name}`)
      )
    }
  })

  test('stop hiding themselves when given a label, as a lucide icon does', () => {
    expect(
      render(<Mail aria-label="Email" />).hasAttribute('aria-hidden')
    ).toBe(false)
    for (const [Icon, name] of ICONS) {
      const svg = render(<Icon aria-label={name} />)
      expect(svg.hasAttribute('aria-hidden')).toBe(false)
      expect(svg.getAttribute('aria-label')).toBe(name)
    }
  })
})
