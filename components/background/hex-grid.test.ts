import { describe, expect, test } from 'bun:test'
import { generateHexGrid, parseRgba, type HexCell } from './hex-renderer'

/** The cell at (col, row); throws when the grid has none there. */
function cellAt(grid: HexCell[], col: number, row: number): HexCell {
  const cell = grid.find(c => c.col === col && c.row === row)
  if (!cell) throw new Error(`no cell at col ${col}, row ${row}`)
  return cell
}

/**
 * The radius renderFrame draws every hexagon at, read back from the grid:
 * flat-topped hexagons that tile sit one and a half radii apart across.
 */
function radiusOf(grid: HexCell[]): number {
  return (cellAt(grid, 1, 0).cx - cellAt(grid, 0, 0).cx) / 1.5
}

/** Inside or on the edge of the flat-topped hexagon drawHexPath traces. */
function insideHexagon(x: number, y: number, cell: HexCell, r: number) {
  const dx = Math.abs(x - cell.cx)
  const dy = Math.abs(y - cell.cy)
  const epsilon = 1e-9
  return (
    dy <= (Math.sqrt(3) / 2) * r + epsilon &&
    Math.sqrt(3) * dx + dy <= Math.sqrt(3) * r + epsilon
  )
}

describe('generateHexGrid cell counts', () => {
  test('a 400 by 300 canvas gets 12 columns of 9 cells, each (col, row) once', () => {
    const grid = generateHexGrid(400, 300)
    expect(grid.length).toBe(108)
    expect(new Set(grid.map(c => `${c.col},${c.row}`)).size).toBe(108)
    const cols = grid.map(c => c.col)
    const rows = grid.map(c => c.row)
    expect([Math.min(...cols), Math.max(...cols)]).toEqual([-1, 10])
    expect([Math.min(...rows), Math.max(...rows)]).toEqual([-1, 7])
  })

  test('an empty canvas still gets the padding ring of 5 by 5 cells', () => {
    expect(generateHexGrid(0, 0).length).toBe(25)
  })
})

describe('generateHexGrid offsets', () => {
  const grid = generateHexGrid(400, 300)
  const r = radiusOf(grid)
  const rowStep = r * Math.sqrt(3)

  test('the radius is the 40 px the renderer draws with', () => {
    expect(r).toBe(40)
  })

  test('cells in a column are one hexagon height apart; columns are 1.5 radii apart', () => {
    for (const cell of grid) {
      if (cell.row > -1) {
        const above = cellAt(grid, cell.col, cell.row - 1)
        expect(cell.cy - above.cy).toBeCloseTo(rowStep, 9)
        expect(cell.cx).toBe(above.cx)
      }
      if (cell.col > -1) {
        expect(cell.cx - cellAt(grid, cell.col - 1, cell.row).cx).toBe(1.5 * r)
      }
    }
  })

  test('from column 0 on, odd columns sit half a hexagon lower than even ones', () => {
    // Column -1 is left out: `-1 % 2` is -1 in JavaScript, so it is not
    // shifted, and its cells lie wholly off the canvas.
    const evenTop = cellAt(grid, 0, -1).cy
    const lastCol = Math.max(...grid.map(c => c.col))
    for (let col = 0; col <= lastCol; col++) {
      const shift = col % 2 === 1 ? rowStep / 2 : 0
      expect(cellAt(grid, col, -1).cy - evenTop).toBeCloseTo(shift, 9)
    }
  })

  test('the hexagons cover every point of the canvas, edges included, with no gap', () => {
    for (const [width, height] of [
      [400, 300],
      [412, 823],
    ]) {
      const cells = generateHexGrid(width, height)
      const radius = radiusOf(cells)
      const step = 4
      for (let x = 0; x <= width; x += step) {
        for (let y = 0; y <= height; y += step) {
          const covered = cells.some(cell => insideHexagon(x, y, cell, radius))
          if (!covered) throw new Error(`(${x}, ${y}) on ${width}x${height}`)
        }
      }
    }
  })
})

describe('parseRgba', () => {
  test('reads integer channels and a decimal alpha, with or without a leading zero', () => {
    expect(parseRgba('rgba(13, 148, 136, 0.05)')).toEqual([13, 148, 136, 0.05])
    expect(parseRgba('rgba(1,2,3,.5)')).toEqual([1, 2, 3, 0.5])
  })

  test('anything without four numbers reads as transparent black', () => {
    // Every HEX_COLORS stroke is written in rgba(); an rgb() or hex stroke
    // would draw black rather than fail.
    expect(parseRgba('rgb(1, 2, 3)')).toEqual([0, 0, 0, 0])
    expect(parseRgba('#ffffff')).toEqual([0, 0, 0, 0])
  })
})
