import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import {
  BRIGHTNESS,
  HEX_COLORS,
  HEX_RENDER_PALETTES,
  IDLE_AFTER_MS,
  VEIL_QUERY,
  createRenderPalette,
  generateHexGrid,
  parseRgba,
  renderFrame,
  shouldIdle,
  strokeColor,
  updateWave,
  type HexColorPalette,
  type HexWaveState,
} from './hex-renderer'

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

describe('palette precomputation', () => {
  test('createRenderPalette reads each colour string exactly once', () => {
    const reads: Record<string, number> = {}
    const counting = {} as HexColorPalette
    for (const key of [
      'baseStroke',
      'hoverStroke',
      'brightStroke',
      'waveFill',
      'innerHex',
    ] as const) {
      reads[key] = 0
      Object.defineProperty(counting, key, {
        get() {
          reads[key]++
          return HEX_COLORS.dark[key]
        },
      })
    }

    createRenderPalette(counting)

    expect(Object.values(reads)).toEqual([1, 1, 1, 1, 1])
  })

  test('strokes become numbers; fills stay strings the canvas takes verbatim', () => {
    const palette = createRenderPalette(HEX_COLORS.light)
    expect(palette.base).toEqual({ r: 15, g: 23, b: 43 })
    expect(palette.hover).toEqual({ r: 15, g: 23, b: 43 })
    expect(palette.bright).toEqual({ r: 59, g: 130, b: 246 })
    expect(palette.waveFill).toBe(HEX_COLORS.light.waveFill)
    expect(palette.innerHex).toBe(HEX_COLORS.light.innerHex)
  })

  test('both themes are parsed once at module load, so a theme swap re-parses nothing', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(HEX_RENDER_PALETTES[theme]).toEqual(
        createRenderPalette(HEX_COLORS[theme])
      )
      // Reading the constant twice yields the same object: switching themes
      // in the loop is a property lookup, never a re-parse.
      expect(HEX_RENDER_PALETTES[theme]).toBe(HEX_RENDER_PALETTES[theme])
    }
  })
})

describe('strokeColor', () => {
  /**
   * The pre-optimisation path, reproduced exactly: blend both endpoints
   * (alpha included) into an rgba() string, then regex that string apart and
   * rebuild it with the cell's brightness as alpha. The real code also wrote
   * the intermediate string to ctx.strokeStyle and read the canvas' own
   * serialisation back out; Chrome round-trips rgba() with integer channels
   * unchanged, so parsing the string we built is equivalent.
   */
  function legacyStrokeColor(
    palette: HexColorPalette,
    colorT: number,
    brightness: number
  ): string {
    const mix = (a: number, b: number) => a + (b - a) * colorT
    const [r1, g1, b1, a1] = parseRgba(palette.baseStroke)
    const [r2, g2, b2, a2] = parseRgba(
      colorT > 0.5 ? palette.brightStroke : palette.hoverStroke
    )
    const blended = `rgba(${Math.round(mix(r1, r2))}, ${Math.round(mix(g1, g2))}, ${Math.round(mix(b1, b2))}, ${mix(a1, a2).toFixed(3)})`
    const parts = blended.match(/[\d.]+/g)!
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${brightness.toFixed(3)})`
  }

  test('matches the old parse-and-rebuild path across the whole input range', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (let i = 0; i <= 20; i++) {
        const colorT = i / 20
        const brightness = BRIGHTNESS.veiled[theme].base + colorT * 0.1
        expect(strokeColor(HEX_RENDER_PALETTES[theme], colorT, brightness)).toBe(
          legacyStrokeColor(HEX_COLORS[theme], colorT, brightness)
        )
      }
    }
  })

  test('alpha comes from the cell brightness, not from the palette alpha', () => {
    // The dark base stroke carries alpha 0.03; the cell brightness wins.
    expect(HEX_COLORS.dark.baseStroke).toContain('0.03')
    expect(strokeColor(HEX_RENDER_PALETTES.dark, 0, 0.123)).toBe(
      'rgba(96, 165, 250, 0.123)'
    )
  })

  test('switches to the bright endpoint above the halfway point', () => {
    const below = strokeColor(HEX_RENDER_PALETTES.dark, 0.5, 0.1)
    const above = strokeColor(HEX_RENDER_PALETTES.dark, 0.51, 0.1)
    expect(below).not.toBe(above)
  })
})

describe('idle policy', () => {
  const awake = {
    waveActive: false,
    pointerOnCanvas: true,
    msSincePointerMove: 0,
    reducedMotion: false,
  }

  test('stays awake while a wave is expanding', () => {
    expect(shouldIdle({ ...awake, waveActive: true })).toBe(false)
  })

  test('stays awake while the pointer is moving over the canvas', () => {
    expect(shouldIdle(awake)).toBe(false)
    expect(
      shouldIdle({ ...awake, msSincePointerMove: IDLE_AFTER_MS - 1 })
    ).toBe(false)
  })

  test('idles once the pointer has been still for the full delay', () => {
    expect(shouldIdle({ ...awake, msSincePointerMove: IDLE_AFTER_MS })).toBe(
      true
    )
  })

  test('idles immediately when the pointer is off-canvas', () => {
    expect(shouldIdle({ ...awake, pointerOnCanvas: false })).toBe(true)
  })

  test('an active wave outranks both an off-canvas and a long-still pointer', () => {
    expect(
      shouldIdle({
        waveActive: true,
        pointerOnCanvas: false,
        msSincePointerMove: IDLE_AFTER_MS * 10,
        reducedMotion: false,
      })
    ).toBe(false)
  })

  test('reduced motion idles even with a wave flagged active', () => {
    // Reduced motion suppresses the wave, the glow and the shimmer, so the
    // frame is static regardless of the other inputs.
    expect(
      shouldIdle({ ...awake, reducedMotion: true, waveActive: true })
    ).toBe(true)
  })

  test('the delay is long enough to survive an ordinary pause in pointer movement', () => {
    expect(IDLE_AFTER_MS).toBeGreaterThanOrEqual(1000)
    expect(IDLE_AFTER_MS).toBeLessThanOrEqual(5000)
  })
})

describe('wave lifetime', () => {
  function newWave(radius: number): HexWaveState {
    return { active: true, originX: 0, originY: 0, radius, startTime: 0 }
  }

  test('stays active while it still contributes brightness', () => {
    const wave = newWave(0)
    updateWave(wave, 1)
    expect(wave.active).toBe(true)
    expect(wave.radius).toBeGreaterThan(0)
  })

  test('deactivates as soon as its fade reaches zero, releasing the loop', () => {
    const wave = newWave(1490)
    updateWave(wave, 1)
    expect(wave.active).toBe(false)
  })

  test('an inactive wave is not advanced', () => {
    const wave = { ...newWave(10), active: false }
    updateWave(wave, 1)
    expect(wave.radius).toBe(10)
  })
})

describe('renderFrame canvas work', () => {
  const realWindow = (globalThis as { window?: unknown }).window

  beforeAll(() => {
    ;(globalThis as { window?: unknown }).window = { devicePixelRatio: 1 }
  })
  afterAll(() => {
    ;(globalThis as { window?: unknown }).window = realWindow
  })

  function createMockContext(width: number, height: number) {
    const counts = {
      save: 0,
      restore: 0,
      translate: 0,
      scale: 0,
      stroke: 0,
      fill: 0,
      strokeStyleReads: 0,
    }
    const strokeWrites: string[] = []
    let strokeStyle = '#000000'

    const ctx = {
      canvas: { width, height },
      lineWidth: 1,
      fillStyle: '',
      globalAlpha: 1,
      get strokeStyle() {
        counts.strokeStyleReads++
        return strokeStyle
      },
      set strokeStyle(value: string) {
        strokeStyle = value
        strokeWrites.push(value)
      },
      clearRect() {},
      save() {
        counts.save++
      },
      restore() {
        counts.restore++
      },
      translate() {
        counts.translate++
      },
      scale() {
        counts.scale++
      },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      stroke() {
        counts.stroke++
      },
      fill() {
        counts.fill++
      },
    }

    return {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      counts,
      strokeWrites,
    }
  }

  const idleWave: HexWaveState = {
    active: false,
    originX: 0,
    originY: 0,
    radius: 0,
    startTime: 0,
  }
  const offCanvas = { x: -1000, y: -1000 }
  const levels = BRIGHTNESS.veiled.dark

  function render(
    mock: ReturnType<typeof createMockContext>,
    mouse: { x: number; y: number },
    wave: HexWaveState = { ...idleWave }
  ) {
    renderFrame(
      mock.ctx,
      generateHexGrid(400, 300),
      mouse,
      0,
      HEX_RENDER_PALETTES.dark,
      wave,
      1 / 60,
      false,
      levels
    )
  }

  test('never reads back ctx.strokeStyle — the regex round-trip is gone', () => {
    const mock = createMockContext(400, 300)
    render(mock, { x: 200, y: 150 })
    expect(mock.counts.stroke).toBeGreaterThan(0)
    expect(mock.counts.strokeStyleReads).toBe(0)
  })

  test('touches the canvas state stack for no cell when nothing is scaled', () => {
    const mock = createMockContext(400, 300)
    render(mock, offCanvas)
    expect(mock.counts.stroke).toBeGreaterThan(0)
    expect(mock.counts.save).toBe(0)
    expect(mock.counts.restore).toBe(0)
    expect(mock.counts.translate).toBe(0)
    expect(mock.counts.scale).toBe(0)
  })

  test('saves and restores only around the cells the pointer scales', () => {
    const mock = createMockContext(400, 300)
    render(mock, { x: 200, y: 150 })
    expect(mock.counts.save).toBeGreaterThan(0)
    expect(mock.counts.save).toBe(mock.counts.restore)
    expect(mock.counts.save).toBeLessThan(mock.counts.stroke)
  })

  test('writes each cell stroke exactly once, using strokeColor', () => {
    const mock = createMockContext(400, 300)
    render(mock, offCanvas)
    // One write per stroked cell: no second write to override the alpha.
    expect(mock.strokeWrites.length).toBe(mock.counts.stroke)
    // Every write is a finished rgba() string in the dark stroke hue, with
    // the per-cell shimmer alpha already baked in.
    for (const write of mock.strokeWrites) {
      expect(write).toMatch(/^rgba\(96, 165, 250, 0\.\d{3}\)$/)
    }
    expect(new Set(mock.strokeWrites).size).toBeGreaterThan(1)
  })

  test('leaves globalAlpha at 1 without relying on save/restore', () => {
    const mock = createMockContext(400, 300)
    render(mock, { x: 200, y: 150 }, { ...idleWave, active: true, radius: 100 })
    expect(mock.counts.fill).toBeGreaterThan(0)
    expect(mock.ctx.globalAlpha).toBe(1)
  })
})
