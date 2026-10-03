import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

/**
 * app/favicon.ico and app/apple-icon.png are Next's metadata file
 * conventions, so each is served at its own URL and linked from every page.
 * These tests read the two files' bytes directly (the ICO directory, PNG
 * chunks, and the apple icon's pixels through node:zlib) rather than through
 * an image library, which keeps them free of dependencies.
 */
const APP = join(process.cwd(), 'app')
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

/**
 * The 16, 32 and 48 px PNGs of the mark, as they were exported. The favicon
 * carries them byte for byte, so a re-export that changes a single pixel or
 * drops the Display P3 profile they embed fails here instead of shipping.
 */
const MARK_SHA256: Record<number, string> = {
  16: 'a5d79ed0ea0490f2fd273763ab9665ae8a1c78fd4b913e6dd1783952a23e3b1f',
  32: 'a1a3d4242896fee24c73516e66d2814222f7ec822b3078fcb15a95e1d0acddcd',
  48: 'dc06b72ee53184cc7726a8c746a85c2864752dece16a4851a128f290b4b1df4c',
}

/**
 * The ticket's target was under 10 KB. The three entries kept byte for byte,
 * profile included, come to 10,286 bytes, and the mark stays exactly as it
 * is, so the line sits just above that. It only catches gross growth (an
 * entry as large as the old 64 or 256 px ones); the entry list and the
 * hashes below are what stop a small fourth entry or a re-export.
 */
const FAVICON_MAX_BYTES = 11_000

type IcoEntry = {
  width: number
  height: number
  reserved: number
  offset: number
  image: Buffer
}

/** ICONDIR (6 bytes) then one 16-byte ICONDIRENTRY per image; 0 means 256. */
function readIco(file: Buffer): IcoEntry[] {
  expect(file.readUInt16LE(0)).toBe(0)
  expect(file.readUInt16LE(2)).toBe(1)
  const count = file.readUInt16LE(4)
  return Array.from({ length: count }, (_, i) => {
    const at = 6 + 16 * i
    const size = file.readUInt32LE(at + 8)
    const offset = file.readUInt32LE(at + 12)
    expect(offset + size).toBeLessThanOrEqual(file.length)
    return {
      width: file[at] || 256,
      height: file[at + 1] || 256,
      reserved: file[at + 3],
      offset,
      image: file.subarray(offset, offset + size),
    }
  })
}

/** Width, height, bit depth and color type from a PNG's IHDR chunk. */
function readPngHeader(png: Buffer) {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
  expect(png.toString('latin1', 12, 16)).toBe('IHDR')
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colorType: png[25],
  }
}

const APPLE_ICON_SHA256 =
  'bcdc3d414fe2b22faa14f74362af618870e4cc21c60cd98a58cf93a1ce8649da'

/** Each chunk after the PNG signature: its type and its data. */
function pngChunks(png: Buffer): { type: string; data: Buffer }[] {
  const chunks: { type: string; data: Buffer }[] = []
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at)
    chunks.push({
      type: png.toString('latin1', at + 4, at + 8),
      data: png.subarray(at + 8, at + 8 + length),
    })
    at += 12 + length
  }
  return chunks
}

/**
 * The decoded rows of a non-interlaced 8-bit RGBA PNG: the IDAT chunks
 * inflated, then each row's filter (none, sub, up, average, Paeth) undone.
 */
function rgbaRows(png: Buffer, width: number, height: number): Buffer[] {
  expect(png[28]).toBe(0)
  const idat = pngChunks(png)
    .filter(chunk => chunk.type === 'IDAT')
    .map(chunk => chunk.data)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  expect(raw.length).toBe(height * (stride + 1))
  const rows: Buffer[] = []
  let previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    expect(filter).toBeLessThanOrEqual(4)
    const row = Buffer.from(
      raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    )
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? row[x - 4] : 0
      const up = previous[x]
      const upLeft = x >= 4 ? previous[x - 4] : 0
      const predictor = [
        0,
        left,
        up,
        (left + up) >> 1,
        paeth(left, up, upLeft),
      ][filter]
      row[x] = (row[x] + predictor) & 0xff
    }
    rows.push(row)
    previous = row
  }
  return rows
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const toLeft = Math.abs(estimate - left)
  const toUp = Math.abs(estimate - up)
  const toUpLeft = Math.abs(estimate - upLeft)
  if (toLeft <= toUp && toLeft <= toUpLeft) return left
  return toUp <= toUpLeft ? up : upLeft
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')

describe('app/favicon.ico (MTC-20)', () => {
  const file = readFileSync(join(APP, 'favicon.ico'))

  test(`is under ${FAVICON_MAX_BYTES} bytes`, () => {
    expect(file.length).toBeLessThan(FAVICON_MAX_BYTES)
  })

  test('holds exactly the 16, 32 and 48 px entries', () => {
    const entries = readIco(file)
    expect(entries.map(e => [e.width, e.height])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ])
  })

  test('lays its images out back to back after the directory, nothing trailing', () => {
    const entries = readIco(file)
    let expected = 6 + 16 * entries.length
    for (const entry of entries) {
      expect(entry.reserved).toBe(0)
      expect(entry.offset).toBe(expected)
      expected += entry.image.length
    }
    expect(expected).toBe(file.length)
  })

  test('each entry is a PNG whose own header matches its directory entry', () => {
    for (const entry of readIco(file)) {
      const png = readPngHeader(entry.image)
      expect([png.width, png.height]).toEqual([entry.width, entry.height])
    }
  })

  test('each entry is the original export of the mark, byte for byte', () => {
    for (const entry of readIco(file)) {
      expect(sha256(entry.image)).toBe(MARK_SHA256[entry.width])
    }
  })
})

describe('app/apple-icon.png (MTC-20)', () => {
  const file = readFileSync(join(APP, 'apple-icon.png'))
  const png = readPngHeader(file)

  test('is 180 x 180, the size iOS asks for on a home screen', () => {
    expect([png.width, png.height]).toEqual([180, 180])
  })

  /**
   * iOS has long drawn a home-screen icon's transparent pixels as black, so
   * the icon must stay opaque whatever tool exports it next.
   */
  test('is 8-bit truecolor with every pixel opaque', () => {
    expect(png.bitDepth).toBe(8)
    expect([2, 6]).toContain(png.colorType)
    // tRNS gives a truecolor PNG transparency without an alpha channel.
    expect(pngChunks(file).map(chunk => chunk.type)).not.toContain('tRNS')
    if (png.colorType === 6) {
      const alphas = rgbaRows(file, png.width, png.height).flatMap(row =>
        Array.from({ length: png.width }, (_, x) => row[4 * x + 3])
      )
      expect(alphas.filter(a => a !== 255)).toEqual([])
    }
  })

  /**
   * The mark's 256 px PNG downscaled to 180 x 180 by macOS sips, Display P3
   * profile included. A re-export that changes the pixels or drops the
   * profile fails here instead of shipping.
   */
  test('is the export of the mark, byte for byte', () => {
    expect(sha256(file)).toBe(APPLE_ICON_SHA256)
  })
})
