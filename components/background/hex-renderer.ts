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

const HEX_RADIUS = 40
const MOUSE_INFLUENCE_RADIUS = 180
const WAVE_RING_WIDTH = 50
const WAVE_SPEED = 350 // px per second
const SHIMMER_PERIOD = 10000 // ms
const MAX_OPACITY_DARK = 0.15
const MAX_OPACITY_LIGHT = 0.08

function easeOutQuad(t: number): number {
  return t * (2 - t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpColor(
  r1: number, g1: number, b1: number, a1: number,
  r2: number, g2: number, b2: number, a2: number,
  t: number
): string {
  return `rgba(${Math.round(lerp(r1, r2, t))}, ${Math.round(lerp(g1, g2, t))}, ${Math.round(lerp(b1, b2, t))}, ${lerp(a1, a2, t).toFixed(3)})`
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
      const cy = row * vertSpacing + (col % 2 === 1 ? vertSpacing / 2 : 0) - padding
      cells.push({ cx, cy, col, row })
    }
  }

  return cells
}

function drawHexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
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
  // Deactivate when wave has fully passed beyond any reasonable viewport
  if (wave.radius > 3000) {
    wave.active = false
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  grid: HexCell[],
  mouse: { x: number; y: number },
  time: number,
  palette: HexColorPalette,
  wave: HexWaveState,
  dt: number,
  reducedMotion: boolean,
  isDark: boolean,
): void {
  const { width, height } = ctx.canvas
  const dpr = Math.min(window.devicePixelRatio, 2)
  const w = width / dpr
  const h = height / dpr

  ctx.clearRect(0, 0, w, h)

  if (!reducedMotion) {
    updateWave(wave, dt)
  }

  const maxOpacity = isDark ? MAX_OPACITY_DARK : MAX_OPACITY_LIGHT

  for (let i = 0; i < grid.length; i++) {
    const hex = grid[i]

    // Ambient shimmer — slow diagonal sine wave
    let shimmer = 0
    if (!reducedMotion) {
      shimmer = Math.sin(time / SHIMMER_PERIOD * Math.PI * 2 + (hex.cx + hex.cy) * 0.003) * 0.012 + 0.012
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
        const waveFade = Math.max(0, 1 - wave.radius / 1500)
        waveInfluence *= waveFade
      }
    }

    // Combined brightness
    const baseBrightness = isDark ? 0.03 : 0.02
    let brightness = baseBrightness + shimmer + mouseInfluence * 0.12 + waveInfluence * 0.15
    brightness = Math.min(brightness, maxOpacity)

    // Skip nearly invisible hexagons for performance
    if (brightness < 0.01) continue

    // Interpolation factor for color (0 = base, 1 = bright)
    const colorT = Math.min(1, (brightness - baseBrightness) / (maxOpacity - baseBrightness))

    // Scale effect
    const scale = 1 + mouseInfluence * 0.02 + waveInfluence * 0.01

    // Line width
    const lineWidth = lerp(0.5, 1.2, colorT)

    ctx.save()

    if (scale !== 1) {
      ctx.translate(hex.cx, hex.cy)
      ctx.scale(scale, scale)
      ctx.translate(-hex.cx, -hex.cy)
    }

    // Draw outer hexagon
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = lerpColor(
      ...parseRgba(palette.baseStroke),
      ...parseRgba(colorT > 0.5 ? palette.brightStroke : palette.hoverStroke),
      colorT,
    )
    // Override alpha with computed brightness
    const strokeParts = ctx.strokeStyle.match(/[\d.]+/g)
    if (strokeParts && strokeParts.length >= 4) {
      ctx.strokeStyle = `rgba(${strokeParts[0]}, ${strokeParts[1]}, ${strokeParts[2]}, ${brightness.toFixed(3)})`
    }

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

    ctx.restore()
  }
}

// Parse "rgba(r, g, b, a)" into [r, g, b, a]
function parseRgba(color: string): [number, number, number, number] {
  const m = color.match(/[\d.]+/g)
  if (!m || m.length < 4) return [0, 0, 0, 0]
  return [Number(m[0]), Number(m[1]), Number(m[2]), Number(m[3])]
}
