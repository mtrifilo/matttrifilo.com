// Pure rendering engine for the hexagonal background effect.
// No React or DOM dependencies — only Canvas2D drawing and math.

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
export function createRenderPalette(palette: HexColorPalette): HexRenderPalette {
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
 * How long the pointer may sit still on the canvas before the field is
 * treated as idle and the loop stops.
 *
 * Two seconds: long enough that ordinary pauses while reading or reaching
 * for the scroll wheel do not stop and restart the loop dozens of times a
 * minute, short enough that CPU is back at zero almost as soon as the
 * reader settles on the page. Resuming costs one animation frame, so a
 * "premature" idle is imperceptible — the only thing a paused frame gives
 * up is the ambient shimmer, whose amplitude is +/-0.012 alpha.
 */
export const IDLE_AFTER_MS = 2000

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
 * Whether the frame just drawn is the last one needed until something wakes
 * the loop. Every input that can change a pixel is either in here or is a
 * discrete event (theme, resize, veil breakpoint) that wakes the loop
 * directly.
 *
 * Reduced motion is checked first and on its own: it disables the shimmer,
 * the pointer glow and the wave, so the frame is static no matter what the
 * pointer or a still-flagged wave are doing.
 */
export function shouldIdle(state: IdleInput): boolean {
  if (state.reducedMotion) return true
  if (state.waveActive) return false
  return !state.pointerOnCanvas || state.msSincePointerMove >= IDLE_AFTER_MS
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

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  grid: HexCell[],
  mouse: { x: number; y: number },
  time: number,
  palette: HexRenderPalette,
  wave: HexWaveState,
  dt: number,
  reducedMotion: boolean,
  levels: BrightnessLevels
): void {
  const { width, height } = ctx.canvas
  const dpr = Math.min(window.devicePixelRatio, 2)
  const w = width / dpr
  const h = height / dpr

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
