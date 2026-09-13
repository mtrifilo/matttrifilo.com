// Pure rendering engine for the hexagonal background effect.
// No React, no window, no globals — only the Canvas2D context it is handed,
// maths, and the frame-scheduling policy below. Everything environmental
// (device pixel ratio, media queries, event wiring) is the component's job
// and arrives as an argument.

export interface HexCell {
  cx: number
  cy: number
  col: number
  row: number
}

export interface HexWaveState {
  active: boolean
  originX: number
  originY: number
  radius: number
  startTime: number
}

export interface HexColorPalette {
  baseStroke: string
  hoverStroke: string
  brightStroke: string
  waveFill: string
  innerHex: string
}

/** An RGB triple with the alpha channel deliberately dropped (see HEX_COLORS). */
export interface HexRgb {
  r: number
  g: number
  b: number
}

/**
 * A palette in the shape the render loop consumes: stroke colours already
 * parsed to numbers, fills left as strings because they are handed to the
 * canvas verbatim. Producing one of these is the only place a colour string
 * is ever parsed, which is why the render loop cannot regress into
 * per-cell regex work — it has no strings left to parse.
 */
export interface HexRenderPalette {
  base: HexRgb
  hover: HexRgb
  bright: HexRgb
  waveFill: string
  innerHex: string
}

// Note: the alpha channel of these strokes is ignored. strokeColor supplies
// the computed per-cell brightness as alpha instead (see BRIGHTNESS); only
// the RGB components are used, blended between base/hover/bright. The alphas
// are kept in the literals so the values read as complete CSS colours and so
// waveFill/innerHex, which ARE used verbatim, stay in the same format.
export const HEX_COLORS = {
  dark: {
    baseStroke: 'rgba(96, 165, 250, 0.03)',
    hoverStroke: 'rgba(96, 165, 250, 0.12)',
    brightStroke: 'rgba(147, 197, 253, 0.18)',
    waveFill: 'rgba(59, 130, 246, 0.04)',
    innerHex: 'rgba(45, 212, 191, 0.1)',
  },
  light: {
    baseStroke: 'rgba(15, 23, 43, 0.02)',
    hoverStroke: 'rgba(15, 23, 43, 0.06)',
    brightStroke: 'rgba(59, 130, 246, 0.09)',
    waveFill: 'rgba(59, 130, 246, 0.025)',
    innerHex: 'rgba(13, 148, 136, 0.05)',
  },
} as const

/** Parse "rgba(r, g, b, a)" into [r, g, b, a]. */
export function parseRgba(color: string): [number, number, number, number] {
  const m = color.match(/[\d.]+/g)
  if (!m || m.length < 4) return [0, 0, 0, 0]
  return [Number(m[0]), Number(m[1]), Number(m[2]), Number(m[3])]
}

function strokeRgb(color: string): HexRgb {
  const [r, g, b] = parseRgba(color)
  return { r, g, b }
}

/** Parse one theme's colour strings into the numeric form renderFrame wants. */
export function createRenderPalette(
  palette: HexColorPalette
): HexRenderPalette {
  return {
    base: strokeRgb(palette.baseStroke),
    hover: strokeRgb(palette.hoverStroke),
    bright: strokeRgb(palette.brightStroke),
    waveFill: palette.waveFill,
    innerHex: palette.innerHex,
  }
}

/**
 * The only two palettes the site can ever show, parsed at module load.
 * A theme toggle swaps which one the loop reads; it never re-parses.
 */
export const HEX_RENDER_PALETTES = {
  dark: createRenderPalette(HEX_COLORS.dark),
  light: createRenderPalette(HEX_COLORS.light),
} as const

const HEX_RADIUS = 40
const MOUSE_INFLUENCE_RADIUS = 180
const WAVE_RING_WIDTH = 50
const WAVE_SPEED = 350 // px per second
/**
 * Radius at which the wave's contribution has faded to exactly zero for
 * every cell. Past this point the wave is invisible, so it is also the
 * point at which it stops counting as "active" and stops holding the loop
 * awake — worth ~4s of 60 fps per page load, with no pixel changed.
 */
const WAVE_FADE_DISTANCE = 1500
const SHIMMER_PERIOD = 10000 // ms
/**
 * Viewport width at which the reading column (48rem) has ~4rem of real
 * gutter per side. Above it globals.css masks the column and the field uses
 * BRIGHTNESS.veiled; below it the field is full-bleed at BRIGHTNESS.fullBleed.
 * lib tests assert the CSS media query matches this string.
 */
export const VEIL_QUERY = '(min-width: 56rem)'

export interface BrightnessLevels {
  /** Stroke alpha floor for an idle cell. */
  base: number
  /** Stroke alpha ceiling under pointer glow / wave. */
  max: number
}

/**
 * Per-cell stroke alpha range. `veiled` is used on viewports wide enough to
 * have gutters beside the reading column, where a CSS mask hides the field
 * behind the text (treatment C, MTC-25) and the gutters can carry a real
 * lattice. `fullBleed` is the original, fainter range used where the field
 * sits directly under text (narrow viewports, no mask).
 */
export const BRIGHTNESS = {
  veiled: {
    light: { base: 0.05, max: 0.14 },
    dark: { base: 0.07, max: 0.22 },
  },
  fullBleed: {
    light: { base: 0.02, max: 0.08 },
    dark: { base: 0.03, max: 0.15 },
  },
} as const satisfies Record<string, Record<'light' | 'dark', BrightnessLevels>>

/**
 * How long the pointer may sit still on the canvas before the field counts
 * as idle and the loop drops to IDLE_FRAME_INTERVAL_MS.
 *
 * Two seconds: long enough that ordinary pauses while reading or reaching
 * for the scroll wheel do not flip the loop between rates dozens of times a
 * minute, short enough that the cost drops almost as soon as the reader
 * settles on the page. Coming back costs one animation frame, so an early
 * drop to the idle rate is imperceptible.
 */
export const IDLE_AFTER_MS = 2000

/**
 * Frame interval used while the field is idle — about 4 fps.
 *
 * The only thing still moving when idle is the ambient shimmer, a sine with
 * a SHIMMER_PERIOD (10s) cycle, so 250ms gives it 40 samples per period:
 * far denser than the eye needs for a gradient that drifts by 0.024 alpha
 * over ten seconds, and 1/15th of the frames a full-rate loop would spend
 * on it. Dropping the loop entirely would be cheaper still, but it freezes
 * the field for anyone who never moves a pointer — touch readers, keyboard
 * readers — which is most of the time the background is on screen.
 */
export const IDLE_FRAME_INTERVAL_MS = 250

export interface IdleInput {
  /** True while a wave is still expanding across the grid. */
  waveActive: boolean
  /** False once the pointer has left the window. */
  pointerOnCanvas: boolean
  /** Milliseconds since the last accepted pointermove. */
  msSincePointerMove: number
  reducedMotion: boolean
}

/**
 * Whether the field is idle: nothing the reader is driving is animating, so
 * only the ambient shimmer is left to draw.
 *
 * This is not "stop" — see nextFrameMode, which turns idle into a slow
 * cadence rather than a halt. Reduced motion is checked first and on its
 * own because it disables the shimmer, the pointer glow and the wave alike,
 * making the frame genuinely static whatever the pointer or a still-flagged
 * wave are doing.
 */
export function shouldIdle(state: IdleInput): boolean {
  if (state.reducedMotion) return true
  if (state.waveActive) return false
  return !state.pointerOnCanvas || state.msSincePointerMove >= IDLE_AFTER_MS
}

export type FrameMode = 'raf' | 'slow' | 'parked'

/**
 * How the loop should keep going after the frame it just drew.
 *
 *   raf    — something the reader is driving is moving; draw every frame.
 *   slow   — only the shimmer is moving; draw every IDLE_FRAME_INTERVAL_MS.
 *   parked — nothing can move at all; draw nothing until woken.
 *
 * Only reduced motion parks, and it parks unconditionally: with the
 * shimmer, glow and wave all suppressed, every further frame would be a
 * pixel-for-pixel repeat of this one.
 */
export function nextFrameMode(
  idle: boolean,
  reducedMotion: boolean
): FrameMode {
  if (reducedMotion) return 'parked'
  return idle ? 'slow' : 'raf'
}

/** Cap on a single frame's delta, so a long gap cannot jump the wave. */
const MAX_FRAME_DT_MS = 100

export interface FrameSchedulerHost {
  requestFrame: (callback: (now: number) => void) => number
  cancelFrame: (handle: number) => void
  setTimer: (callback: () => void, delayMs: number) => number
  clearTimer: (handle: number) => void
  /** Monotonic clock on the same time origin as requestFrame's timestamps. */
  now: () => number
  /** Draw one frame and say how the loop should continue afterwards. */
  drawFrame: (now: number, dt: number) => FrameMode
}

export interface FrameScheduler {
  /** Return to full rate, from either the slow cadence or a full park. */
  wake: () => void
  /** Cancel whatever is scheduled. The scheduler can still be woken after. */
  stop: () => void
  /** What is currently scheduled, for tests and diagnostics. */
  mode: () => FrameMode
}

/** What is scheduled right now; null is the parked state. */
type PendingFrame = { kind: 'raf' | 'slow'; handle: number } | null

/**
 * Owns how often frames happen, separately from what a frame draws. One
 * `pending` record is the single source of truth for "running": it says both
 * whether something is scheduled and which mechanism has to be cancelled,
 * so the two handles can never disagree or leak past each other.
 *
 * Three invariants, each of which has a test:
 *
 *   - A wake() re-entered from inside drawFrame never schedules a second
 *     loop. That would orphan the in-flight handle, leaving it uncancellable
 *     and running past unmount.
 *   - A wake() that arrives during a frame still wins: the frame it asked
 *     for has not been drawn yet, so the loop continues at full rate even
 *     when drawFrame asked to slow down or park.
 *   - Switching rates cancels the old mechanism before arming the new one,
 *     so waking out of the slow cadence never leaves its timer behind.
 *   - A stop() re-entered from inside drawFrame is honoured: the frame does
 *     not reschedule itself on the way out.
 */
export function createFrameScheduler(host: FrameSchedulerHost): FrameScheduler {
  let pending: PendingFrame = null
  let lastTime = host.now()
  let inFrame = false
  let wokenDuringFrame = false
  let stoppedDuringFrame = false

  function schedule(kind: 'raf' | 'slow'): void {
    pending =
      kind === 'raf'
        ? { kind, handle: host.requestFrame(tick) }
        : {
            kind,
            handle: host.setTimer(
              () => tick(host.now()),
              IDLE_FRAME_INTERVAL_MS
            ),
          }
  }

  function cancelPending(): void {
    if (!pending) return
    if (pending.kind === 'raf') host.cancelFrame(pending.handle)
    else host.clearTimer(pending.handle)
    pending = null
  }

  function tick(now: number): void {
    inFrame = true
    wokenDuringFrame = false
    stoppedDuringFrame = false
    const dt = Math.min(now - lastTime, MAX_FRAME_DT_MS) / 1000
    lastTime = now

    const mode = host.drawFrame(now, dt)

    inFrame = false
    // The frame this handle stood for has now run; nothing left to cancel.
    pending = null

    // A stop() from inside the frame outranks both the wake and the mode.
    if (stoppedDuringFrame) return
    if (wokenDuringFrame) schedule('raf')
    else if (mode !== 'parked') schedule(mode)
  }

  return {
    wake() {
      wokenDuringFrame = true
      // Inside a frame, tick honours wokenDuringFrame when it reschedules.
      if (inFrame) return
      if (pending?.kind === 'raf') return
      // Either parked, or a slow frame is waiting on a timer we no longer
      // want: drop it and go back to full rate now.
      cancelPending()
      // Restart the clock: the loop may have been parked for minutes, and
      // the stale timestamp would hand the next frame a dt that only the
      // cap above saves it from.
      lastTime = host.now()
      schedule('raf')
    },
    stop() {
      stoppedDuringFrame = true
      cancelPending()
    },
    mode: () => pending?.kind ?? 'parked',
  }
}

function easeOutQuad(t: number): number {
  return t * (2 - t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * The stroke colour for one cell: RGB blended from base towards hover or
 * bright, alpha taken from the cell's computed brightness rather than from
 * the palette (see the note on HEX_COLORS).
 *
 * Computing it straight from numbers replaces what used to be two regex
 * parses, a string build, a write to ctx.strokeStyle, a read back of the
 * canvas' serialised form, a third regex over that, and a second write —
 * per cell, per frame.
 */
export function strokeColor(
  palette: HexRenderPalette,
  colorT: number,
  alpha: number
): string {
  const target = colorT > 0.5 ? palette.bright : palette.hover
  const r = Math.round(lerp(palette.base.r, target.r, colorT))
  const g = Math.round(lerp(palette.base.g, target.g, colorT))
  const b = Math.round(lerp(palette.base.b, target.b, colorT))
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

// Flat-topped hexagon grid generation
export function generateHexGrid(width: number, height: number): HexCell[] {
  const cells: HexCell[] = []
  const r = HEX_RADIUS
  const horizSpacing = r * 1.5
  const vertSpacing = r * Math.sqrt(3)
  const padding = r * 2

  const cols = Math.ceil((width + padding * 2) / horizSpacing) + 1
  const rows = Math.ceil((height + padding * 2) / vertSpacing) + 1

  for (let col = -1; col < cols; col++) {
    for (let row = -1; row < rows; row++) {
      const cx = col * horizSpacing - padding
      const cy =
        row * vertSpacing + (col % 2 === 1 ? vertSpacing / 2 : 0) - padding
      cells.push({ cx, cy, col, row })
    }
  }

  return cells
}

function drawHexPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number
) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

export function updateWave(wave: HexWaveState, dt: number): void {
  if (!wave.active) return
  wave.radius += WAVE_SPEED * dt
  // Deactivate once the fade below has zeroed the wave's contribution.
  if (wave.radius >= WAVE_FADE_DISTANCE) {
    wave.active = false
  }
}

export interface HexFrameInput {
  ctx: CanvasRenderingContext2D
  grid: HexCell[]
  /** Pointer position in CSS pixels; far off-canvas when there is none. */
  mouse: { x: number; y: number }
  /** Timestamp in ms, driving the ambient shimmer. */
  time: number
  palette: HexRenderPalette
  wave: HexWaveState
  /** Seconds since the previous frame. */
  dt: number
  reducedMotion: boolean
  levels: BrightnessLevels
  /**
   * The device pixel ratio the caller baked into ctx's transform when it
   * sized the bitmap. Passed in rather than re-read from the window so that
   * clearRect below cannot disagree with the transform actually in force —
   * a window dragged to a display with a different ratio changes
   * devicePixelRatio long before the canvas is resized to match.
   */
  dpr: number
}

export function renderFrame(frame: HexFrameInput): void {
  const {
    ctx,
    grid,
    mouse,
    time,
    palette,
    wave,
    dt,
    reducedMotion,
    levels,
    dpr,
  } = frame
  const w = ctx.canvas.width / dpr
  const h = ctx.canvas.height / dpr

  ctx.clearRect(0, 0, w, h)

  if (!reducedMotion) {
    updateWave(wave, dt)
  }

  const maxOpacity = levels.max

  for (let i = 0; i < grid.length; i++) {
    const hex = grid[i]

    // Ambient shimmer — slow diagonal sine wave
    let shimmer = 0
    if (!reducedMotion) {
      shimmer =
        Math.sin(
          (time / SHIMMER_PERIOD) * Math.PI * 2 + (hex.cx + hex.cy) * 0.003
        ) *
          0.012 +
        0.012
    }

    // Mouse proximity influence
    let mouseInfluence = 0
    if (!reducedMotion) {
      const dx = hex.cx - mouse.x
      const dy = hex.cy - mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < MOUSE_INFLUENCE_RADIUS) {
        mouseInfluence = easeOutQuad(1 - dist / MOUSE_INFLUENCE_RADIUS)
      }
    }

    // Wave influence
    let waveInfluence = 0
    if (!reducedMotion && wave.active) {
      const wdx = hex.cx - wave.originX
      const wdy = hex.cy - wave.originY
      const wdist = Math.sqrt(wdx * wdx + wdy * wdy)
      const ringDist = Math.abs(wdist - wave.radius)
      if (ringDist < WAVE_RING_WIDTH) {
        waveInfluence = easeOutQuad(1 - ringDist / WAVE_RING_WIDTH)
        // Fade out as wave expands
        const waveFade = Math.max(0, 1 - wave.radius / WAVE_FADE_DISTANCE)
        waveInfluence *= waveFade
      }
    }

    // Combined brightness
    const baseBrightness = levels.base
    let brightness =
      baseBrightness + shimmer + mouseInfluence * 0.12 + waveInfluence * 0.15
    brightness = Math.min(brightness, maxOpacity)

    // Skip nearly invisible hexagons for performance
    if (brightness < 0.01) continue

    // Interpolation factor for color (0 = base, 1 = bright)
    const colorT = Math.min(
      1,
      (brightness - baseBrightness) / (maxOpacity - baseBrightness)
    )

    // Scale effect
    const scale = 1 + mouseInfluence * 0.02 + waveInfluence * 0.01

    // Line width
    const lineWidth = lerp(0.5, 1.2, colorT)

    // Only pay for the canvas state stack when there is a transform to undo.
    // With the pointer away and no wave, scale is exactly 1 for every cell,
    // so the common case costs nothing. Every other piece of context state
    // this loop touches (lineWidth, strokeStyle, fillStyle) is reassigned
    // before its next use, and globalAlpha is reset inline below, so the
    // save/restore pair was only ever restoring the transform.
    const scaled = scale !== 1
    if (scaled) {
      ctx.save()
      ctx.translate(hex.cx, hex.cy)
      ctx.scale(scale, scale)
      ctx.translate(-hex.cx, -hex.cy)
    }

    // Draw outer hexagon
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = strokeColor(palette, colorT, brightness)

    drawHexPath(ctx, hex.cx, hex.cy, HEX_RADIUS)
    ctx.stroke()

    // Wave fill effect
    if (waveInfluence > 0.1) {
      ctx.fillStyle = palette.waveFill
      ctx.globalAlpha = waveInfluence * 0.3
      drawHexPath(ctx, hex.cx, hex.cy, HEX_RADIUS)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // Inner concentric hex for "dimensional depth" during wave
    if (waveInfluence > 0.2) {
      ctx.strokeStyle = palette.innerHex
      ctx.lineWidth = 0.8
      ctx.globalAlpha = waveInfluence * 0.5
      drawHexPath(ctx, hex.cx, hex.cy, HEX_RADIUS * 0.6)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    if (scaled) ctx.restore()
  }
}
