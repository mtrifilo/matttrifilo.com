import { describe, expect, test } from 'bun:test'
import { hexPoints, honeycombDataUrl, honeycombSvg } from './honeycomb'

describe('honeycomb', () => {
  test('a hexagon has six vertices on the circle of the given radius', () => {
    const pts = hexPoints(0, 0, 10)
      .split(' ')
      .map(p => p.split(',').map(Number))
    expect(pts).toHaveLength(6)
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(10, 0)
  })

  test('tiles past every edge so no row ends in a straight cut', () => {
    const svg = honeycombSvg({
      width: 100,
      height: 100,
      radius: 20,
      stroke: 'red',
    })
    const polygons = svg.match(/<polygon/g) ?? []
    // 100/34.6 → 3 cols + 2 overshoot + the col=-1 start; 100/30 → 4 rows + 2 + 1.
    expect(polygons.length).toBe(6 * 7)
    expect(svg).toContain('stroke="red"')
    expect(svg.startsWith('<svg xmlns=')).toBe(true)
  })

  test('data URL is a CSS url() with the SVG percent-encoded', () => {
    const url = honeycombDataUrl({
      width: 10,
      height: 10,
      radius: 5,
      stroke: 'rgba(0,0,0,0.1)',
    })
    expect(url.startsWith('url("data:image/svg+xml,%3Csvg')).toBe(true)
    expect(url).not.toContain('<')
  })
})
