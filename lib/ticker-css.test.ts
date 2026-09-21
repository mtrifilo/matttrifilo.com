import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  TICKER_ANIMATION_NAME,
  TICKER_COPIES,
  TICKER_KEYFRAME_FROM,
} from '@/components/assistant/ticker-geometry'

/**
 * The contract between app/globals.css and the starter ticker (MTC-39).
 *
 * The row's behaviour is split across three languages: a keyframe in the
 * stylesheet, a copy count in the component, and the conversions in
 * ticker-geometry.ts. They are one decision, and each of the checks below is
 * an edit that would otherwise pass typecheck, lint and every other test
 * while quietly breaking the row in a way only a keyboard user would meet.
 */

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

/** The first `selector { … }` block in the stylesheet, braces balanced. */
function ruleFor(selector: string): string {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`${selector} is not in app/globals.css`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  throw new Error(`${selector} is not closed`)
}

describe('the ticker keyframe', () => {
  const keyframe = ruleFor(`@keyframes ${TICKER_ANIMATION_NAME}`)

  test('travels one copy of the pool, in the direction the maths assumes', () => {
    // Reversing these two, which is the shape most marquees are written in,
    // mirrors every conversion in ticker-geometry.ts: a focused pill would
    // then scroll to the opposite end of the row.
    const [from, to] = keyframe.split('transform:').slice(1)
    expect(from).toContain(TICKER_KEYFRAME_FROM)
    expect(to).toContain('translateX(0)')
  })

  test('the distance matches the number of copies the track renders', () => {
    // 100 / TICKER_COPIES percent of the track is one copy only while the
    // component renders exactly that many.
    expect(TICKER_KEYFRAME_FROM).toBe(`translateX(-${100 / TICKER_COPIES}%)`)
    expect(keyframe).toContain(`-${100 / TICKER_COPIES}%`)
  })

  test('the track runs it by name', () => {
    expect(ruleFor('.starter-ticker-track {')).toContain(
      `animation: ${TICKER_ANIMATION_NAME} `
    )
  })
})

describe('the row the component scrolls', () => {
  const row = ruleFor('.starter-ticker {')

  test('is hidden, not clipped', () => {
    // `overflow: clip` hides the same pixels and is the natural cleanup
    // here, but it leaves no scroll box, and scrollLeft is what brings a
    // focused pill into view once the track has stopped moving.
    expect(row).toContain('overflow: hidden')
    expect(row).not.toContain('overflow: clip')
  })

  test('declares the fade width on itself, in pixels', () => {
    // starter-ticker.tsx reads --ticker-fade off this element with
    // getComputedStyle and parses it as pixels. Declared on the track
    // instead it would not inherit upwards, and declared in rem it would
    // parse to a number sixteen times too small; both fail silently, and
    // the focused pill lands under the gradient.
    const fade = /--ticker-fade:\s*([^;]+);/.exec(row)?.[1].trim()
    expect(fade).toMatch(/^\d+(?:\.\d+)?px$/)
  })
})

describe('the state flags the component writes', () => {
  test('the stylesheet reads the attributes the component sets', () => {
    // These are strings on both sides of the boundary. A rename in one file
    // leaves the other writing an attribute nothing styles, and the row
    // simply never pauses or never freezes.
    expect(css).toContain(".starter-ticker-track[data-touched='true']")
    expect(css).toContain(".starter-ticker-track[data-frozen='true']")
  })

  test('freezing drops the animation rather than pausing it', () => {
    // Pausing would hold the transform, which would then be added to the
    // scroll offset the component sets: the row would jump by one loop.
    expect(ruleFor(".starter-ticker-track[data-frozen='true']")).toContain(
      'animation: none'
    )
  })
})
