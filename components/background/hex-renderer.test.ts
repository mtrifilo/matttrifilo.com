import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import {
  BRIGHTNESS,
  HEX_COLORS,
  HEX_RENDER_PALETTES,
  IDLE_AFTER_MS,
  IDLE_FRAME_INTERVAL_MS,
  VEIL_QUERY,
  createFrameScheduler,
  createRenderPalette,
  generateHexGrid,
  nextFrameMode,
  parseRgba,
  renderFrame,
  shouldIdle,
  strokeColor,
  updateWave,
  type FrameMode,
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
  test('strokes become numbers; fills stay strings the canvas takes verbatim', () => {
    const palette = createRenderPalette(HEX_COLORS.light)
    expect(palette.base).toEqual({ r: 15, g: 23, b: 43 })
    expect(palette.hover).toEqual({ r: 15, g: 23, b: 43 })
    expect(palette.bright).toEqual({ r: 59, g: 130, b: 246 })
    expect(palette.waveFill).toBe(HEX_COLORS.light.waveFill)
    expect(palette.innerHex).toBe(HEX_COLORS.light.innerHex)
  })

  test('both themes are precomputed, so a theme swap re-parses nothing', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(HEX_RENDER_PALETTES[theme]).toEqual(
        createRenderPalette(HEX_COLORS[theme])
      )
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

describe('nextFrameMode', () => {
  test('draws every frame while the reader is driving something', () => {
    expect(nextFrameMode(false, false)).toBe('raf')
  })

  test('drops to the slow cadence when idle, rather than stopping', () => {
    expect(nextFrameMode(true, false)).toBe('slow')
  })

  test('parks under reduced motion, idle or not', () => {
    expect(nextFrameMode(true, true)).toBe('parked')
    expect(nextFrameMode(false, true)).toBe('parked')
  })

  test('the idle cadence samples the shimmer well above flicker', () => {
    // The shimmer is the only thing moving at the idle rate; it wants enough
    // samples per 10s cycle to read as a drift rather than a step.
    expect(10_000 / IDLE_FRAME_INTERVAL_MS).toBeGreaterThanOrEqual(20)
    // ...and few enough to be a real saving over 60 fps.
    expect(IDLE_FRAME_INTERVAL_MS).toBeGreaterThanOrEqual(100)
  })
})

describe('frame scheduler', () => {
  /** A fake host with hand-driven rAF and timers, so nothing is timing-dependent. */
  function createHarness(drawFrame: (now: number, dt: number) => FrameMode) {
    let nextHandle = 1
    let clock = 1000
    const frames = new Map<number, (now: number) => void>()
    const timers = new Map<number, { run: () => void; delayMs: number }>()
    const cancelled: string[] = []

    const scheduler = createFrameScheduler({
      requestFrame(callback) {
        const handle = nextHandle++
        frames.set(handle, callback)
        return handle
      },
      cancelFrame(handle) {
        cancelled.push(`raf:${handle}`)
        frames.delete(handle)
      },
      setTimer(callback, delayMs) {
        const handle = nextHandle++
        timers.set(handle, { run: callback, delayMs })
        return handle
      },
      clearTimer(handle) {
        cancelled.push(`timer:${handle}`)
        timers.delete(handle)
      },
      now: () => clock,
      drawFrame,
    })

    return {
      scheduler,
      cancelled,
      advance: (ms: number) => {
        clock += ms
      },
      pendingFrames: () => frames.size,
      pendingTimers: () => timers.size,
      timerDelays: () => [...timers.values()].map((t) => t.delayMs),
      /** Run whatever is scheduled, rAF first. */
      runNext() {
        const frame = [...frames.entries()][0]
        if (frame) {
          frames.delete(frame[0])
          frame[1](clock)
          return
        }
        const timer = [...timers.entries()][0]
        if (!timer) throw new Error('nothing scheduled')
        timers.delete(timer[0])
        timer[1].run()
      },
    }
  }

  test('starts parked and wakes to full rate', () => {
    const h = createHarness(() => 'raf')
    expect(h.scheduler.mode()).toBe('parked')
    h.scheduler.wake()
    expect(h.scheduler.mode()).toBe('raf')
    expect(h.pendingFrames()).toBe(1)
  })

  test('an idle frame reschedules on the slow timer, not on rAF', () => {
    const h = createHarness(() => 'slow')
    h.scheduler.wake()
    h.runNext()
    expect(h.scheduler.mode()).toBe('slow')
    expect(h.pendingFrames()).toBe(0)
    expect(h.timerDelays()).toEqual([IDLE_FRAME_INTERVAL_MS])
  })

  test('the slow cadence keeps drawing, so the shimmer never freezes', () => {
    let drawn = 0
    const h = createHarness(() => {
      drawn++
      return 'slow'
    })
    h.scheduler.wake()
    for (let i = 0; i < 4; i++) {
      h.advance(IDLE_FRAME_INTERVAL_MS)
      h.runNext()
    }
    expect(drawn).toBe(4)
    expect(h.scheduler.mode()).toBe('slow')
  })

  test('waking out of the slow cadence cancels its timer', () => {
    const h = createHarness(() => 'slow')
    h.scheduler.wake()
    h.runNext()
    expect(h.pendingTimers()).toBe(1)

    h.scheduler.wake()
    expect(h.scheduler.mode()).toBe('raf')
    expect(h.pendingTimers()).toBe(0)
    expect(h.pendingFrames()).toBe(1)
    expect(h.cancelled.some((c) => c.startsWith('timer:'))).toBe(true)
  })

  test('a parked frame schedules nothing at all', () => {
    const h = createHarness(() => 'parked')
    h.scheduler.wake()
    h.runNext()
    expect(h.scheduler.mode()).toBe('parked')
    expect(h.pendingFrames()).toBe(0)
    expect(h.pendingTimers()).toBe(0)
  })

  /**
   * A harness whose drawFrame re-enters wake(), the way a synchronously
   * dispatched contextrestored or visibilitychange would.
   */
  function createSelfWakingHarness(mode: FrameMode) {
    const reentrant: { wake?: () => void } = {}
    const harness = createHarness(() => {
      reentrant.wake!()
      return mode
    })
    reentrant.wake = harness.scheduler.wake
    return harness
  }

  test('a wake() from inside a frame does not double-schedule', () => {
    const h = createSelfWakingHarness('raf')
    h.scheduler.wake()
    h.runNext()
    // A second scheduled callback would orphan the first handle, leaving it
    // uncancellable and running past unmount.
    expect(h.pendingFrames() + h.pendingTimers()).toBe(1)
  })

  test('a wake() from inside a frame beats a park or a slowdown', () => {
    for (const mode of ['parked', 'slow'] as const) {
      const h = createSelfWakingHarness(mode)
      h.scheduler.wake()
      h.runNext()
      expect(h.scheduler.mode()).toBe('raf')
      expect(h.pendingFrames()).toBe(1)
      expect(h.pendingTimers()).toBe(0)
    }
  })

  test('stop() cancels whichever mechanism is armed', () => {
    for (const mode of ['raf', 'slow'] as const) {
      const h = createHarness(() => mode)
      h.scheduler.wake()
      h.runNext()
      h.scheduler.stop()
      expect(h.scheduler.mode()).toBe('parked')
      expect(h.pendingFrames()).toBe(0)
      expect(h.pendingTimers()).toBe(0)
    }
  })

  test('a long gap is capped, so a resumed loop cannot jump the wave', () => {
    const deltas: number[] = []
    const h = createHarness((_now, dt) => {
      deltas.push(dt)
      return 'raf'
    })
    h.scheduler.wake()
    h.advance(60_000)
    h.runNext()
    expect(deltas[0]).toBeLessThanOrEqual(0.1)
  })

  test('waking after a park restarts the clock rather than carrying the gap', () => {
    const deltas: number[] = []
    const h = createHarness((_now, dt) => {
      deltas.push(dt)
      return 'parked'
    })
    h.scheduler.wake()
    h.runNext()
    h.advance(60_000)
    h.scheduler.wake()
    h.runNext()
    expect(deltas[1]).toBe(0)
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
    const cleared: number[] = []
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
      clearRect(x: number, y: number, w: number, h: number) {
        cleared.push(x, y, w, h)
      },
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
      cleared,
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
    renderFrame({
      ctx: mock.ctx,
      grid: generateHexGrid(400, 300),
      mouse,
      time: 0,
      palette: HEX_RENDER_PALETTES.dark,
      wave,
      dt: 1 / 60,
      reducedMotion: false,
      levels,
      dpr: 1,
    })
  }

  test('clears using the dpr it was handed, not a global one', () => {
    const mock = createMockContext(800, 600)
    renderFrame({
      ctx: mock.ctx,
      grid: [],
      mouse: offCanvas,
      time: 0,
      palette: HEX_RENDER_PALETTES.dark,
      wave: { ...idleWave },
      dt: 0,
      reducedMotion: false,
      levels,
      dpr: 2,
    })
    // 800x600 bitmap at dpr 2 is a 400x300 CSS box.
    expect(mock.cleared).toEqual([0, 0, 400, 300])
  })

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
