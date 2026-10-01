import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantDisclosure } from './assistant-disclosure'
import {
  ASSISTANT_EVALS_TITLE,
  ASSISTANT_HOW_BUILT_TEXT,
  ASSISTANT_HOW_BUILT_URL,
  MATT_EMAIL,
} from './copy'
import { EvalsPublishedProvider } from './evals-published'

/**
 * The disclosure is the one place the eval results are offered from, and it
 * offers them on a condition it cannot check itself. These pin both ends of
 * that: nothing links to the page unless a surface says there is a run, and
 * a surface that says so gets the link.
 */

describe('the disclosure', () => {
  test('always says what the answers are and who to ask', () => {
    const html = renderToStaticMarkup(<AssistantDisclosure />)
    expect(html).toContain('AI-generated')
    expect(html).toContain(MATT_EMAIL)
    expect(html).toContain('saved')
  })

  test('offers no eval results when no surface says a run is published', () => {
    // The default. A surface that forgets the provider withholds the link
    // rather than linking to a page with nothing on it.
    const html = renderToStaticMarkup(<AssistantDisclosure />)
    expect(html).not.toContain('/ask/evals')
    expect(html).not.toContain(ASSISTANT_EVALS_TITLE)
  })

  test('offers them when a surface says a run is published', () => {
    const html = renderToStaticMarkup(
      <EvalsPublishedProvider published>
        <AssistantDisclosure />
      </EvalsPublishedProvider>
    )
    expect(html).toContain('/ask/evals')
    expect(html).toContain(ASSISTANT_EVALS_TITLE)
  })

  test('always offers how it was built, in a new tab, published run or not', () => {
    for (const published of [false, true]) {
      const html = renderToStaticMarkup(
        <EvalsPublishedProvider published={published}>
          <AssistantDisclosure />
        </EvalsPublishedProvider>
      )
      const anchor = html.match(
        new RegExp(`<a [^>]*href="${ASSISTANT_HOW_BUILT_URL}"[^>]*>([^<]*)</a>`)
      )
      expect(anchor, `published: ${published}`).not.toBeNull()
      expect(anchor?.[1]).toBe(ASSISTANT_HOW_BUILT_TEXT)
      expect(anchor?.[0]).toContain('target="_blank"')
      expect(anchor?.[0]).toContain('rel="noopener noreferrer"')
    }
  })

  test('withholds them when a surface says no run is published', () => {
    const html = renderToStaticMarkup(
      <EvalsPublishedProvider published={false}>
        <AssistantDisclosure />
      </EvalsPublishedProvider>
    )
    expect(html).not.toContain('/ask/evals')
  })
})
