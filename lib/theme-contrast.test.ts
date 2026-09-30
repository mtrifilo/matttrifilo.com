import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  BRIGHTNESS,
  generateHexGrid,
  HEX_RENDER_PALETTES,
  renderFrame,
} from '@/components/background/hex-renderer'
import { cssBlock } from '@/test/css-block'

/**
 * The contrast the Career Assistant's surfaces depend on, computed from the
 * theme tokens in app/globals.css (MTC-88).
 *
 * Every pair below is a token drawn on a surface it is actually drawn on:
 * /ask puts its text straight on the page, the homepage panel puts the same
 * components on a card, and a phone puts the page's text over the honeycomb
 * canvas. WCAG 2.2 asks 4.5:1 of text under 18 pt (1.4.3) and 3:1 of the
 * parts of a control and its focus indicator (1.4.11). A pair that fails
 * here fails for a visitor, whatever the component tests say: Happy DOM
 * never loads the stylesheet.
 *
 * What this cannot see: text inside a row's edge fade (the mask takes it to
 * transparent by design, for the pill entering or leaving), and the canvas
 * brightening under a pointer, which the runbook's "Accessibility and
 * performance" section records with its numbers.
 */

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

const THEMES = [
  ['light', cssBlock(css, ':root {')],
  ['dark', cssBlock(css, '.dark {')],
] as const

const TEXT = 4.5
const UI = 3

/**
 * Each pair names what wears it, so a failure says which part of the page
 * a visitor could not read.
 */
const PAIRS: readonly {
  what: string
  color: string
  surfaces: readonly string[]
  minimum: number
}[] = [
  {
    what: 'the answer, the questions and the pills',
    color: '--foreground',
    surfaces: ['--background', '--card', '--muted'],
    minimum: TEXT,
  },
  {
    what: 'the muted text: disclosure line, intro, progress rows, notices, answer actions, placeholder',
    color: '--muted-foreground',
    surfaces: ['--background', '--card'],
    minimum: TEXT,
  },
  {
    what: '"See all questions" and a hovered pill',
    color: '--primary',
    surfaces: ['--background', '--card'],
    minimum: TEXT,
  },
  {
    what: 'the over-limit counter and the error icon',
    color: '--destructive',
    surfaces: ['--card'],
    minimum: TEXT,
  },
  {
    what: 'the focus ring',
    color: '--ring',
    surfaces: ['--background', '--card'],
    minimum: UI,
  },
  {
    what: 'the send button against the composer',
    color: '--primary',
    surfaces: ['--card'],
    minimum: UI,
  },
  {
    what: 'the send arrow on its button',
    color: '--primary-foreground',
    surfaces: ['--primary'],
    minimum: UI,
  },
]

describe.each(THEMES)('the %s theme', (_theme, block) => {
  test.each(PAIRS.map(pair => [pair.what, pair] as const))(
    '%s',
    (_what, { color, surfaces, minimum }) => {
      // Listed rather than asserted one by one, so a failure names every
      // surface that falls short and by how much.
      const short = surfaces
        .map(surface => ({
          surface,
          ratio: round(contrast(hexOf(block, color), hexOf(block, surface))),
        }))
        .filter(({ ratio }) => ratio < minimum)
      expect(short).toEqual([])
    }
  )
})

describe('the focus indicators draw the ring token at full strength', () => {
  // The pairs above measure the token. These hold the places that draw it
  // to the token as it is: at half strength the base outline and the
  // Button's halo were 1.5:1 to 2.2:1, and on the dark theme the halo is a
  // pill's whole indicator, because `dark:border-border` outranks the
  // focused border.
  test('the outline every element falls back to', () => {
    const base = cssBlock(css, '@layer base {')
    expect(base).toMatch(/@apply border-border outline-ring;/)
  })

  test("the Button's 3 px ring", () => {
    const button = readFileSync(
      new URL('../components/ui/button.tsx', import.meta.url),
      'utf8'
    )
    expect(button).toContain('focus-visible:ring-ring ')
    expect(button).not.toMatch(/focus-visible:ring-ring\/\d+/)
  })
})

describe('text over the honeycomb canvas, where nothing veils it', () => {
  // Below 56rem the canvas is full-bleed under the text of /ask, with no
  // mask. At rest (no pointer, no entrance wave) the only thing that moves
  // is the shimmer, so its most opaque stroke is the worst background a
  // glyph can cross. It is read off the renderer itself, over a whole
  // shimmer period, rather than restated. The stroke is a hairline (under
  // 1 px at rest), so this is the worst pixel, not the text's surroundings.
  function shortOverCanvas(
    theme: 'light' | 'dark',
    colors: readonly string[]
  ): { color: string; ratio: number }[] {
    const block = THEMES.find(([name]) => name === theme)![1]
    const stroke = brightestRestingStroke(theme)
    const worst = over(
      stroke.rgb,
      stroke.alpha,
      parseHex(hexOf(block, '--background'))
    )
    return colors
      .map(color => ({
        color,
        ratio: round(contrastRgb(parseHex(hexOf(block, color)), worst)),
      }))
      .filter(({ ratio }) => ratio < TEXT)
  }

  test.each([['light'], ['dark']] as const)(
    'the %s theme keeps the answer and "See all questions" readable',
    theme => {
      expect(shortOverCanvas(theme, ['--foreground', '--primary'])).toEqual([])
    }
  )

  test('the dark theme keeps the muted text readable', () => {
    expect(shortOverCanvas('dark', ['--muted-foreground'])).toEqual([])
  })

  // Known short, and left for Matt (MTC-88, 2026-09-28): on the light theme
  // the muted text crossing the brightest resting stroke is 4.36:1. Either a
  // darker light --muted-foreground or a fainter full-bleed canvas clears
  // it, and which is a design call. `failing` keeps the gap on record: when
  // either lands this turns red, and it becomes an ordinary test.
  test.failing('the light theme keeps the muted text readable', () => {
    expect(shortOverCanvas('light', ['--muted-foreground'])).toEqual([])
  })
})

/** The most opaque stroke the resting field draws, and its color. */
function brightestRestingStroke(theme: 'light' | 'dark'): {
  rgb: Rgb
  alpha: number
} {
  let best = { rgb: [0, 0, 0] as Rgb, alpha: 0 }
  const ctx = recordingContext(style => {
    const match = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(style)
    if (match === null) return
    const alpha = Number(match[4])
    if (alpha > best.alpha) {
      best = {
        rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
        alpha,
      }
    }
  })
  const grid = generateHexGrid(800, 800)
  // Ten seconds is one shimmer period; a frame every 50 ms visits its peak.
  for (let time = 0; time <= 10_000; time += 50) {
    renderFrame({
      ctx,
      grid,
      mouse: { x: -1000, y: -1000 },
      time,
      palette: HEX_RENDER_PALETTES[theme],
      wave: { active: false, originX: 0, originY: 0, radius: 0, startTime: 0 },
      dt: 0.05,
      reducedMotion: false,
      levels: BRIGHTNESS.fullBleed[theme],
      dpr: 1,
    })
  }
  if (best.alpha === 0) throw new Error('the renderer drew no stroke')
  return best
}

/**
 * A 2D context that draws nothing and reports every stroke color it is
 * handed, which is all this test needs from renderFrame.
 */
function recordingContext(
  onStroke: (style: string) => void
): CanvasRenderingContext2D {
  const noop = () => {}
  const ctx = {
    canvas: { width: 800, height: 800 },
    clearRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    lineWidth: 1,
    fillStyle: '',
    globalAlpha: 1,
    set strokeStyle(style: string) {
      onStroke(style)
    },
    get strokeStyle() {
      return ''
    },
  }
  return ctx as unknown as CanvasRenderingContext2D
}

type Rgb = [number, number, number]

/** A six-digit hex color a theme block declares for a custom property. */
function hexOf(block: string, property: string): string {
  const match = new RegExp(`${property}:\\s*(#[0-9a-f]{6});`, 'i').exec(block)
  if (match === null) throw new Error(`${property} is not a hex color here`)
  return match[1]
}

function parseHex(hex: string): Rgb {
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

/** `color` at `alpha` painted over an opaque `surface`. */
function over(color: Rgb, alpha: number, surface: Rgb): Rgb {
  return color.map((channel, i) =>
    Math.round(channel * alpha + surface[i] * (1 - alpha))
  ) as Rgb
}

/** WCAG 2 contrast ratio between two hex colors. */
function contrast(a: string, b: string): number {
  return contrastRgb(parseHex(a), parseHex(b))
}

function contrastRgb(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [r, g, b] = rgb.map(value => {
      const channel = value / 255
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

function round(ratio: number): number {
  return Math.round(ratio * 100) / 100
}
