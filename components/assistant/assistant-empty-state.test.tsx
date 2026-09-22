import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantEmptyState } from './assistant-empty-state'
import { ASSISTANT_INTRO, ASSISTANT_NAME } from './copy'

/**
 * The order of the centred group /ask opens on (MTC-55).
 *
 * The group is what a visitor is given instead of a conversation: what this
 * is, what it answers, questions to start from, and then the composer, which
 * assistant-chat.tsx keeps directly underneath. Reordering it is a change
 * every other check here would let through.
 */

const html = decodeEntities(
  renderToStaticMarkup(<AssistantEmptyState onPick={() => {}} />)
)

function decodeEntities(text: string): string {
  return text
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

/** Where a fragment sits in the markup, failing loudly when it is absent. */
function at(fragment: string): number {
  const index = html.indexOf(fragment)
  expect(index).toBeGreaterThanOrEqual(0)
  return index
}

describe('the /ask empty state', () => {
  test('names the assistant as the page heading', () => {
    // The page has exactly one h1 at a time: this one until a conversation
    // starts, a visually hidden one after.
    expect(html.match(/<h1/g) ?? []).toHaveLength(1)
    expect(html).toContain(ASSISTANT_NAME)
  })

  test('reads title, then intro, then the starter questions', () => {
    expect(at('<h1')).toBeLessThan(at(ASSISTANT_INTRO))
    expect(at(ASSISTANT_INTRO)).toBeLessThan(at('starter-ticker'))
  })

  test('offers both ticker rows', () => {
    expect(html.match(/starter-ticker-row/g) ?? []).toHaveLength(2)
  })

  test('claims no more of the column than its own content', () => {
    // The composer is a sibling in assistant-chat.tsx and is centred with
    // this group rather than docked under it, so the group must not stretch
    // and push the composer away.
    const root = html.slice(0, html.indexOf('>'))
    expect(root).not.toMatch(/\b(flex-1|grow|h-full|min-h-)/)
  })
})

describe('the /ask column before the first question', () => {
  // assistant-chat.tsx needs a browser to render, so its layout is read from
  // the source: a flexible space above the group and one below the composer
  // is what centres the two as one, and the composer sits directly under the
  // group with the disclosure under it.
  const source = readFileSync(
    new URL('./assistant-chat.tsx', import.meta.url),
    'utf8'
  )
  const spacer = '{!docked && <div aria-hidden="true" className="flex-1" />}'

  test('centres the group and the composer between two flexible spaces', () => {
    expect(source.split(spacer)).toHaveLength(3)
    const [above, below] = [source.indexOf(spacer), source.lastIndexOf(spacer)]
    expect(above).toBeLessThan(source.indexOf('<AssistantEmptyState'))
    expect(source.indexOf('<AssistantDisclosure')).toBeLessThan(below)
  })

  test('puts the composer under the group and the disclosure under it', () => {
    const group = source.indexOf('<AssistantEmptyState')
    const composer = source.indexOf('<AssistantComposer')
    expect(group).toBeGreaterThan(-1)
    expect(group).toBeLessThan(composer)
    expect(composer).toBeLessThan(source.indexOf('<AssistantDisclosure'))
  })
})
