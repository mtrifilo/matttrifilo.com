import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  EDGE_FADE_PROPERTY,
  TICKER_ANIMATION_NAME,
  TICKER_COPIES,
  TICKER_KEYFRAME_FROM,
  TICKER_KEYFRAME_TO,
} from '@/components/assistant/ticker-geometry'

/**
 * The contract between app/globals.css and the starter ticker (MTC-39).
 *
 * The rows' behaviour is split across two languages: a keyframe in the
 * stylesheet, and the copy count and conversions in ticker-geometry.ts that
 * the component renders and scrolls by. They are one decision, and each of
 * the checks below is
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

/** The at-rule a declaration sits inside, braces balanced. */
function blockAround(needle: string): string {
  const inner = css.indexOf(needle)
  if (inner < 0) throw new Error(`${needle} is not in app/globals.css`)
  const start = css.lastIndexOf('@media', inner)
  if (start < 0) throw new Error(`${needle} is not inside an at-rule`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  throw new Error(`the at-rule around ${needle} is not closed`)
}

/** One step of a keyframe block, by its selector rather than its order. */
function stepOf(keyframe: string, step: 'from' | 'to'): string {
  const match = new RegExp(`\\b${step}\\s*\\{([^}]*)\\}`).exec(keyframe)
  if (match === null) throw new Error(`the keyframe has no ${step} step`)
  return match[1]
}

describe('the ticker keyframe', () => {
  const keyframe = ruleFor(`@keyframes ${TICKER_ANIMATION_NAME}`)

  test('carries the questions right to left, which the maths assumes', () => {
    // The track starts unmoved and travels one copy leftwards, so a question
    // enters at the right edge first word first. Reversing these two shows
    // its last words first and mirrors every conversion in
    // ticker-geometry.ts, so a focused pill would scroll to the opposite end
    // of its row. Read by keyframe selector rather than by position, because
    // swapping only the `from` and `to` labels reverses the loop just as
    // thoroughly.
    expect(stepOf(keyframe, 'from')).toContain(TICKER_KEYFRAME_FROM)
    expect(stepOf(keyframe, 'to')).toContain(TICKER_KEYFRAME_TO)
    expect(TICKER_KEYFRAME_FROM).toBe('translateX(0)')
  })

  test('the distance matches the number of copies the track renders', () => {
    // 100 / TICKER_COPIES percent of the track is one copy only while the
    // component renders exactly that many.
    expect(TICKER_KEYFRAME_TO).toBe(`translateX(-${100 / TICKER_COPIES}%)`)
    expect(keyframe).toContain(`-${100 / TICKER_COPIES}%`)
  })

  test('the track runs it by name', () => {
    expect(ruleFor('.starter-ticker-track {')).toContain(
      `animation: ${TICKER_ANIMATION_NAME} `
    )
  })
})

describe('the rows the component scrolls', () => {
  const row = ruleFor('.starter-ticker-row {')

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
    const mask = /mask-image:([^;]*);/.exec(faded)?.[1] ?? ''
    expect(mask).toContain(`black var(${EDGE_FADE_PROPERTY})`)
    expect(mask).toContain(`calc(100% - var(${EDGE_FADE_PROPERTY}))`)
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

  test('clips vertically, which is what the reveal grows against', () => {
    // The wrapper below animates the row from no height at all. Open this
    // and the pills simply stand outside it: the animation becomes a no-op
    // and nothing else here would notice.
    expect(ruleFor('.follow-up-row {')).toContain('overflow-y: hidden')
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
    // leaves the other writing an attribute nothing styles, and the rows
    // simply never pause or never freeze. A touch is recorded on the group
    // and a freeze on one track, because a touch stops both rows while only
    // the row holding the focused pill hands its position to scrollLeft.
    expect(css).toContain(".starter-ticker[data-touched='true']")
    expect(css).toContain(".starter-ticker-track[data-frozen='true']")
    expect(css).toContain(".starter-ticker-track:not([data-placed='true'])")
    const source = componentSource('starter-ticker.tsx')
    expect(source).toContain("dataset.touched = 'true'")
    expect(source).toContain("dataset.frozen = 'true'")
    expect(source).toContain("dataset.placed = 'true'")
  })

  test('a moving row stays invisible, not absent, until it is placed', () => {
    // Hidden rather than removed, so the row keeps its height and nothing
    // under it moves when it appears; and only where it moves, because a
    // static strip has no opening to wait for.
    const block = blockAround(".starter-ticker-track:not([data-placed='true'])")
    expect(block).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(block).toContain('visibility: hidden')
    expect(block).not.toContain('display: none')
  })

  test('a held or static track leads with the fade width the component adds', () => {
    // starter-ticker.tsx reads the lead back off the frozen track and adds
    // it to scrollLeft, and it places a focused pill clear of the fade it
    // reads off the row. A lead narrower than the fade leaves a row's first
    // pill under the gradient.
    expect(ruleFor(".starter-ticker-track[data-frozen='true']")).toContain(
      `padding-inline-start: var(${EDGE_FADE_PROPERTY})`
    )
    const reduced = blockAround(".starter-ticker-copy[aria-hidden='true']")
    expect(reduced).toContain(`padding-inline: var(${EDGE_FADE_PROPERTY})`)
  })

  test('hover, focus and touch stop both rows, not just the one under the pointer', () => {
    const pause = ruleFor('.starter-ticker:hover .starter-ticker-track')
    expect(pause).toContain(
      '.starter-ticker:focus-within .starter-ticker-track'
    )
    expect(pause).toContain(
      ".starter-ticker[data-touched='true'] .starter-ticker-track"
    )
    expect(pause).toContain('animation-play-state: paused')
  })

  test('reduced motion turns both rows into plain scroll strips', () => {
    // Continuous horizontal motion is a vestibular trigger, so nothing here
    // may move. Each half of this is separately silent when it breaks: a row
    // left as `overflow: hidden` cannot be scrolled to its later questions at
    // all, and a trailing copy left rendered is the row said twice.
    const block = blockAround(".starter-ticker-copy[aria-hidden='true']")
    expect(block).toContain('@media (prefers-reduced-motion: reduce)')
    expect(block).toContain('.starter-ticker-row')
    expect(block).toContain('overflow-x: auto')
    expect(block).toContain('animation: none')
  })

  test('a restart drops the animation and moves nothing', () => {
    // It lasts one forced layout. A lead here would shift the pills during
    // it, which is the freeze's business, not the restart's.
    const restart = ruleFor(".starter-ticker-track[data-restarting='true']")
    expect(restart).toContain('animation: none')
    expect(restart).not.toContain('padding')
    expect(componentSource('starter-ticker.tsx')).toContain(
      "dataset.restarting = 'true'"
    )
  })

  test('freezing drops the animation rather than pausing it', () => {
    // Pausing would hold the transform, which would then be added to the
    // scroll offset the component sets: the row would jump by one loop.
    expect(ruleFor(".starter-ticker-track[data-frozen='true']")).toContain(
      'animation: none'
    )
  })
})
