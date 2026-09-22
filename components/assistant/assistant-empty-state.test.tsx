import { describe, expect, test } from 'bun:test'
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
    // and push the composer away. The flexible space that does the centring
    // is that file's, not this one's.
    expect(html.slice(0, html.indexOf('>'))).toBe(
      '<div class="flex flex-col gap-6"'
    )
  })
})
