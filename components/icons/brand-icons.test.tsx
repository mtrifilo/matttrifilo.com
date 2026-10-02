import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Mail } from 'lucide-react'
import ContactPage from '@/app/contact/page'
import Home from '@/app/page'
import Footer from '@/components/layout/Footer'
import {
  Github,
  Linkedin,
  githubIconNode,
  linkedinIconNode,
} from './brand-icons'

const GITHUB_URL = 'https://github.com/mtrifilo'
const LINKEDIN_URL = 'https://linkedin.com/in/matttrifilo'

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
    test(`${place} draws each icon inside its link`, () => {
      const doc = parse(renderToStaticMarkup(element()))
      expect(iconsIn(doc, GITHUB_URL, 'github')).toHaveLength(1)
      expect(iconsIn(doc, LINKEDIN_URL, 'linkedin')).toHaveLength(1)
    })
  }
})

describe('the local brand icons', () => {
  test('render every shape in their icon nodes, and nothing else', () => {
    for (const [Icon, node] of [
      [Github, githubIconNode],
      [Linkedin, linkedinIconNode],
    ] as const) {
      const shapes = Array.from(render(<Icon />).children).map(child => [
        child.tagName.toLowerCase(),
        Object.fromEntries(
          Array.from(child.attributes).map(a => [a.name, a.value])
        ),
      ])
      // React consumes `key`; it never reaches the DOM.
      const expected = node.map(([tag, attributes]) => [
        tag,
        Object.fromEntries(
          Object.entries(attributes)
            .filter(([name]) => name !== 'key')
            .map(([name, value]) => [name, String(value)])
        ),
      ])
      expect(shapes).toEqual(expected)
    }
  })

  test('get the size, stroke and aria-hidden a lucide icon gets', () => {
    const mail = render(<Mail className="h-4 w-4" />)
    for (const [Icon, name] of [
      [Github, 'github'],
      [Linkedin, 'linkedin'],
    ] as const) {
      const svg = render(<Icon className="h-4 w-4" />)
      expect(sharedAttributes(svg)).toEqual(sharedAttributes(mail))
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('class')).toBe(
        mail.getAttribute('class')!.replace('lucide-mail', `lucide-${name}`)
      )
    }
  })

  test('stop hiding themselves when given a label, as a lucide icon does', () => {
    const mail = render(<Mail aria-label="Email" />)
    const github = render(<Github aria-label="GitHub" />)
    expect(mail.hasAttribute('aria-hidden')).toBe(false)
    expect(github.hasAttribute('aria-hidden')).toBe(false)
    expect(github.getAttribute('aria-label')).toBe('GitHub')
  })
})
