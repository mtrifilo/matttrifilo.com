import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  EDGE_FADE_PROPERTY,
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

/** One step of a keyframe block, by its selector rather than its order. */
function stepOf(keyframe: string, step: 'from' | 'to'): string {
  const match = new RegExp(`\\b${step}\\s*\\{([^}]*)\\}`).exec(keyframe)
  if (match === null) throw new Error(`the keyframe has no ${step} step`)
  return match[1]
}

describe('the ticker keyframe', () => {
  const keyframe = ruleFor(`@keyframes ${TICKER_ANIMATION_NAME}`)

  test('travels one copy of the pool, in the direction the maths assumes', () => {
    // Reversing these two, which is the shape most marquees are written in,
    // mirrors every conversion in ticker-geometry.ts: a focused pill would
    // then scroll to the opposite end of the row. Read by keyframe selector
    // rather than by position, because swapping only the `from` and `to`
    // labels reverses the loop just as thoroughly.
    expect(stepOf(keyframe, 'from')).toContain(TICKER_KEYFRAME_FROM)
    expect(stepOf(keyframe, 'to')).toContain('translateX(0)')
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
})

describe('the shared edge fade', () => {
  const faded = ruleFor('.edge-faded-row {')

  test('declares the fade width on the row, in pixels, at every width', () => {
    // starter-ticker.tsx reads this property off the row element with
    // getComputedStyle and parses it as pixels. Declared on the track
    // instead it would not inherit upwards, and declared in rem it would
    // parse to a number sixteen times too small; both fail silently, and
    // the focused pill lands under the gradient. Every declaration is
    // checked, not just the first: the breakpoint override is the one that
    // applies on the desktop the frames were drawn at.
    expect(faded).toContain(`${EDGE_FADE_PROPERTY}:`)
    const declared = [
      ...css.matchAll(new RegExp(`${EDGE_FADE_PROPERTY}:\\s*([^;]+);`, 'g')),
    ].map(match => match[1].trim())
    expect(declared.length).toBeGreaterThanOrEqual(2)
    for (const value of declared) expect(value).toMatch(/^\d+(?:\.\d+)?px$/)
  })

  test('the fade width is what the scroll padding and the mask use', () => {
    // Declaring the property and then hard-coding a different number in
    // either of the two places that consume it is a silent half-fix: the
    // gradient and the focus offset would stop agreeing.
    expect(faded).toContain(`scroll-padding-inline: var(${EDGE_FADE_PROPERTY})`)
    expect(faded).toContain(`var(${EDGE_FADE_PROPERTY})`)
  })

  test('both rows of pills wear the class that declares it', () => {
    // The fade, the scroll padding and the property the component reads all
    // live on this one class now (MTC-41). A row that renders without it
    // loses its gradient and puts a focused pill under the edge, and neither
    // failure is visible to any other test here.
    for (const file of ['starter-ticker.tsx', 'assistant-answer.tsx']) {
      expect(componentSource(file)).toContain('edge-faded-row')
    }
  })
})

describe('the follow-up row', () => {
  test('scrolls, and keeps a drag from becoming the back gesture', () => {
    const row = ruleFor('.follow-up-row {')
    expect(row).toContain('overflow-x: auto')
    expect(row).toContain('overscroll-behavior-x: contain')
  })

  test('fades the right edge only, where the frame clips it', () => {
    // The row opens at scroll zero and stays there until it is dragged, so
    // the shared both-ends gradient would sit permanently over the first
    // pill. See the rule's own comment.
    const row = ruleFor('.follow-up-row {')
    expect(row).toContain('mask-image: linear-gradient(')
    expect(row).toContain(`black 0,`)
  })

  test('the reveal animates the height the content actually has', () => {
    // A max-height transition reaches the content's height in the first
    // fraction of its duration and reads as a snap; this is the shape that
    // does not.
    const reveal = ruleFor('.follow-up-reveal {')
    expect(reveal).toContain('grid-template-rows: 1fr')
    expect(reveal).toContain('transition: grid-template-rows')
    expect(css).toContain('grid-template-rows: 0fr')
    expect(css).toContain('@starting-style')
  })

  test('the component renders both halves of it', () => {
    const source = componentSource('assistant-answer.tsx')
    expect(source).toContain('follow-up-reveal')
    expect(source).toContain('follow-up-row')
  })
})

function componentSource(file: string): string {
  return readFileSync(
    new URL(`../components/assistant/${file}`, import.meta.url),
    'utf8'
  )
}

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
