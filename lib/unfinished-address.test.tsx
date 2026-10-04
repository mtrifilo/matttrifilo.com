import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { MessageResponse } from '@/components/ai-elements/message'
import { unfinishedAddressBlock } from './unfinished-address'

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
    // Streamdown draws an unfinished Markdown link as its text, which leaves
    // a bare address behind it.
    ['the text of an unfinished Markdown link', 'Email [matt.trifilo@gmail.c'],
    [
      'the URL text of an unfinished Markdown link',
      'The code is at [https://github.com/mtrifilo/matttrifilo.',
    ],
    // Streamdown drops an unfinished HTML tag, which ends the address early.
    [
      'an address an unfinished tag cuts',
      'See https://github.com/mtrifilo/matt<b',
    ],
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

  test('no block is given the plugin', () => {
    expect(
      unfinishedAddressBlock('See https://github.com/mtrifilo/decant', {
        streaming: false,
        remendOptions: TEXT_ONLY,
      })
    ).toBe(-1)
  })
})

const TEXT_ONLY = { linkMode: 'text-only' } as const

describe('the block given the plugin while an answer streams', () => {
  test.each([
    ['the last word cannot be an address', 'Matt led the platform migration'],
    ['the text ends with whitespace', 'Email matt.trifilo@gmail.com '],
    ['the text is empty', ''],
  ])('is none when %s', (_name, text) => {
    expect(
      unfinishedAddressBlock(text, {
        streaming: true,
        remendOptions: TEXT_ONLY,
      })
    ).toBe(-1)
  })

  test('is the last of the blocks Streamdown renders', () => {
    // Two paragraphs and the blank line between them.
    expect(
      unfinishedAddressBlock('He led it.\n\nEmail matt.trifilo@gm', {
        streaming: true,
        remendOptions: TEXT_ONLY,
      })
    ).toBe(2)
  })

  test('keeps an earlier link that shares the address so far', () => {
    expect(
      linksIn(
        'See https://github.com/mtrifilo/decant\n\nAlso https://github.com/mtr',
        true
      )
    ).toEqual(['https://github.com/mtrifilo/decant'])
  })
})

describe('remend', () => {
  test("is the version Streamdown pins, so the blocks are counted as Streamdown's", () => {
    const pinned = (path: string, field: string): unknown =>
      JSON.parse(readFileSync(path, 'utf8'))[field]?.remend
    expect(pinned('package.json', 'dependencies')).toBe(
      pinned('node_modules/streamdown/package.json', 'dependencies')
    )
  })
})
