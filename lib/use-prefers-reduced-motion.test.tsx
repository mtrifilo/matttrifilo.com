import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderHook } from '@testing-library/react'
import { useTranscriptScroll } from '@/components/ai-elements/conversation'
import { cssBlock } from '@/test/css-block'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'

/**
 * Motion a visitor who asked for less does not get (MTC-88): the
 * transcript's scroll to its newest line, which a script drives, and the
 * press feedback on every Button, which the stylesheet does.
 *
 * Happy DOM's `matchMedia` answers from its device settings, so the
 * preference is stated there rather than by replacing `matchMedia`.
 */

const device = (
  window as unknown as {
    happyDOM: { settings: { device: { prefersReducedMotion: string } } }
  }
).happyDOM.settings.device

function setReducedMotion(reduce: boolean): void {
  device.prefersReducedMotion = reduce ? 'reduce' : 'no-preference'
}

afterEach(() => {
  setReducedMotion(false)
})

describe('usePrefersReducedMotion', () => {
  test('is false with no preference', () => {
    expect(renderHook(usePrefersReducedMotion).result.current).toBe(false)
  })

  test('is true once the visitor asks for less motion', () => {
    setReducedMotion(true)
    expect(renderHook(usePrefersReducedMotion).result.current).toBe(true)
  })
})

describe('the transcript scroll', () => {
  test('springs with no preference', () => {
    expect(renderHook(useTranscriptScroll).result.current).toBe('smooth')
  })

  test('jumps under reduced motion', () => {
    setReducedMotion(true)
    expect(renderHook(useTranscriptScroll).result.current).toBe('instant')
  })

  test('is what the conversation and its "Jump to latest" both use', () => {
    // StickToBottom takes the animation as props, and a bare
    // scrollToBottom() springs whatever those say, so both sites have to
    // pass it. Read from source: the library's scrolling needs a layout.
    const source = readFileSync(
      new URL('../components/ai-elements/conversation.tsx', import.meta.url),
      'utf8'
    )
    expect(source).toContain('initial={scroll}')
    expect(source).toContain('resize={scroll}')
    expect(source).toContain('scrollToBottom(scroll)')
  })
})

describe('the Button press feedback', () => {
  test('stops scaling under reduced motion, in a rule after the one it undoes', () => {
    const css = readFileSync(
      new URL('../app/globals.css', import.meta.url),
      'utf8'
    )
    const press = css.indexOf("[data-slot='button']:active {")
    const reduced = css.lastIndexOf('@media (prefers-reduced-motion: reduce)')
    expect(press).toBeGreaterThan(-1)
    expect(reduced).toBeGreaterThan(press)
    expect(
      cssBlock(css.slice(reduced), '@media (prefers-reduced-motion: reduce)')
    ).toMatch(/\[data-slot='button'\]:active \{\s*transform: none;/)
  })
})
