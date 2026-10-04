import { describe, expect, test } from 'bun:test'
import { render } from '@testing-library/react'
import { MessageResponse } from '@/components/ai-elements/message'
import { remarkPluginsFor } from './unfinished-address'

/**
 * Which links an answer shows while it streams (MTC-117), through the
 * renderer the transcript uses. The transcript-level cases, chunk by chunk,
 * are in components/assistant/assistant-chat-streaming-links.test.tsx.
 */

function linksIn(markdown: string, streaming: boolean): string[] {
  const { container } = render(
    <MessageResponse isAnimating={streaming}>{markdown}</MessageResponse>
  )
  return Array.from(container.querySelectorAll('a[href]'), link =>
    link.getAttribute('href')
  ).filter((href): href is string => href !== null)
}

describe('while an answer streams', () => {
  test.each([
    ['an email address', 'Email him at matt.trifilo@gmail.c'],
    ['a URL', 'See https://github.com/mtrifilo/deca'],
    ['a www address', 'See WWW.example.co'],
    ['an address in bold that is still open', 'Email **matt.trifilo@gmail.co'],
    ['an address before a closing period', 'See https://github.com/mtrifilo.'],
  ])('%s in the last word is text, not a link', (_name, markdown) => {
    expect(linksIn(markdown, true)).toEqual([])
  })

  test('the text of a held address is still on screen', () => {
    const { container } = render(
      <MessageResponse isAnimating>
        {'Email him at matt.trifilo@gmail.c'}
      </MessageResponse>
    )
    expect(container.textContent).toContain('matt.trifilo@gmail.c')
  })

  test('an address with whitespace after it is a link', () => {
    expect(linksIn('Email matt.trifilo@gmail.com and', true)).toEqual([
      'mailto:matt.trifilo@gmail.com',
    ])
  })

  test('an address ending an earlier paragraph stays a link while the next one streams', () => {
    expect(
      linksIn(
        'Email matt.trifilo@gmail.com\n\nThe code is at https://github.com/mtrifilo/deca',
        true
      )
    ).toEqual(['mailto:matt.trifilo@gmail.com'])
  })

  test('an address ending an earlier list item stays a link while the next one streams', () => {
    expect(
      linksIn(
        '- https://github.com/mtrifilo/decant\n- https://github.com/mt',
        true
      )
    ).toEqual(['https://github.com/mtrifilo/decant'])
  })

  test('a Markdown link whose URL has arrived is a link', () => {
    expect(
      linksIn('See [the repository](https://github.com/mtrifilo/decant)', true)
    ).toEqual(['https://github.com/mtrifilo/decant'])
  })
})

describe('once an answer has ended', () => {
  test('an address in the last word is a link', () => {
    expect(linksIn('See https://github.com/mtrifilo/decant', false)).toEqual([
      'https://github.com/mtrifilo/decant',
    ])
  })

  test("Streamdown's own plugins render it, unchanged", () => {
    expect(
      remarkPluginsFor('See https://github.com/mtrifilo/decant', {
        streaming: false,
      })
    ).toBeUndefined()
  })
})

describe('the plugins handed to Streamdown', () => {
  test.each([
    ['the last word cannot be an address', 'Matt led the platform migration'],
    ['the text ends with whitespace', 'Email matt.trifilo@gmail.com '],
    ['the text is empty', ''],
  ])('are its own while streaming when %s', (_name, text) => {
    expect(remarkPluginsFor(text, { streaming: true })).toBeUndefined()
  })
})
