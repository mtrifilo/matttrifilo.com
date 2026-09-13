import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { BRIGHTNESS, VEIL_QUERY } from './hex-renderer'

describe('veil breakpoint', () => {
  test('globals.css masks .hex-canvas under the same media query the renderer uses', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'app', 'globals.css'),
      'utf8'
    )
    const block = new RegExp(
      `@media \\${VEIL_QUERY.replace(')', '\\)')}\\s*\\{[^}]*\\.hex-canvas`
    )
    expect(css).toMatch(block)
  })

  test('breakpoint leaves real gutters: first mask stop is positive at the breakpoint width', () => {
    const rem = 16
    const breakpoint = Number(VEIL_QUERY.match(/(\d+)rem/)![1]) * rem
    const readingColumn = 48 * rem
    const veilEdge = 2 * rem
    expect(breakpoint / 2 - readingColumn / 2 - veilEdge).toBeGreaterThan(0)
  })
})

describe('brightness levels', () => {
  test('full-bleed keeps the original alpha range so narrow viewports are unchanged', () => {
    expect(BRIGHTNESS.fullBleed.light).toEqual({ base: 0.02, max: 0.08 })
    expect(BRIGHTNESS.fullBleed.dark).toEqual({ base: 0.03, max: 0.15 })
  })
  test('veiled is brighter than full-bleed in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(BRIGHTNESS.veiled[theme].base).toBeGreaterThan(
        BRIGHTNESS.fullBleed[theme].base
      )
      expect(BRIGHTNESS.veiled[theme].max).toBeGreaterThan(
        BRIGHTNESS.fullBleed[theme].max
      )
    }
  })
})
