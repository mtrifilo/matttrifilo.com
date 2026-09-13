/**
 * Geometry for the honeycomb that backs the social card. Kept as pure
 * string-building so it can be unit-tested without an image renderer and so
 * the card's look lives in one place, next to the site's own hex grid
 * constants (components/background/hex-renderer.ts uses the same radius).
 */
export interface HoneycombOptions {
  width: number
  height: number
  /** Distance from a hex centre to a vertex, in px. */
  radius: number
  /** Stroke colour, any CSS colour; alpha carries the subtlety. */
  stroke: string
  strokeWidth?: number
}

/** Six vertices of a pointy-top hexagon centred on (cx, cy). */
export function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(
      `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`
    )
  }
  return pts.join(' ')
}

/**
 * An SVG document tiling the whole card with hexagons, overshooting the
 * edges by one cell so no partial row shows a straight cut.
 */
export function honeycombSvg(o: HoneycombOptions): string {
  const w = Math.sqrt(3) * o.radius // horizontal pitch (pointy-top)
  const h = 1.5 * o.radius // vertical pitch
  const cols = Math.ceil(o.width / w) + 2
  const rows = Math.ceil(o.height / h) + 2
  const polygons: string[] = []
  for (let row = -1; row < rows; row++) {
    const xOffset = row % 2 === 0 ? 0 : w / 2
    for (let col = -1; col < cols; col++) {
      polygons.push(
        `<polygon points="${hexPoints(col * w + xOffset, row * h, o.radius)}"/>`
      )
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}">` +
    `<g fill="none" stroke="${o.stroke}" stroke-width="${o.strokeWidth ?? 1}">` +
    polygons.join('') +
    `</g></svg>`
  )
}

/** The SVG as a `url(...)` value usable in a CSS background-image. */
export function honeycombDataUrl(o: HoneycombOptions): string {
  return `url("data:image/svg+xml,${encodeURIComponent(honeycombSvg(o))}")`
}
