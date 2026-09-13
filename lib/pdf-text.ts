import { inflateSync } from 'zlib'

/**
 * Minimal text extraction for PDFs produced by Chrome/Skia (as used for the
 * résumé): inflates FlateDecode streams, maps each font's glyph IDs to
 * Unicode via its ToUnicode CMap, and decodes Tj/TJ operands in page content.
 * Enough to assert what text a generated PDF contains; not a general parser.
 */

interface FontMap {
  map: Map<number, string>
  /** Glyph code width in hex digits (2 for one-byte codes, 4 for two-byte). */
  width: number
}

const EMPTY_FONT: FontMap = { map: new Map(), width: 4 }

function utf16(hex: string): string {
  let out = ''
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
  }
  return out
}

function hexToCodes(hex: string, width: number): number[] {
  const codes: number[] = []
  for (let i = 0; i + width <= hex.length; i += width) {
    codes.push(parseInt(hex.slice(i, i + width), 16))
  }
  return codes
}

function decode(hex: string, font: FontMap): string {
  return hexToCodes(hex, font.width)
    .map(c => font.map.get(c) ?? '')
    .join('')
}

function parseCMap(cmap: string): FontMap {
  const map = new Map<number, string>()
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(cmap)
  const width = space ? space[1].length : 4
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(m[1], 16), utf16(m[2]))
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const entry =
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g
    for (const m of block[1].matchAll(entry)) {
      const lo = parseInt(m[1], 16)
      const hi = parseInt(m[2], 16)
      if (m[3].startsWith('[')) {
        const items = [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)].map(x =>
          utf16(x[1])
        )
        items.forEach((s, i) => map.set(lo + i, s))
      } else {
        const base = parseInt(m[3].slice(1, -1), 16)
        for (let c = lo; c <= hi; c++)
          map.set(c, String.fromCharCode(base + (c - lo)))
      }
    }
  }
  return { map, width }
}

export function extractPdfText(pdf: Buffer): string {
  const latin = pdf.toString('latin1')
  const objects = new Map<string, string>()
  for (const m of latin.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g))
    objects.set(m[1], m[2])

  const streamOf = (body: string): string | null => {
    const s = body.indexOf('stream')
    if (s < 0) return null
    let start = s + 'stream'.length
    if (body[start] === '\r') start++
    if (body[start] === '\n') start++
    const end = body.lastIndexOf('endstream')
    const raw = Buffer.from(body.slice(start, end), 'latin1')
    const flate = /\/FlateDecode/.test(body.slice(0, s))
    return (flate ? inflateSync(raw) : raw).toString('latin1')
  }

  const cmapForFont = new Map<string, FontMap>()
  for (const [id, body] of objects) {
    const ref = /\/ToUnicode (\d+) 0 R/.exec(body)
    if (!ref) continue
    const cmapBody = objects.get(ref[1])
    const cmap = cmapBody ? streamOf(cmapBody) : null
    if (cmap) cmapForFont.set(id, parseCMap(cmap))
  }

  const ops =
    /\/(\w+)\s+[\d.]+\s+Tf|<([0-9a-fA-F]+)>\s*Tj|\[((?:<[0-9a-fA-F]*>|[^\]])*)\]\s*TJ|\bT\*|\bTd\b|\bTD\b|\bTm\b/g

  let text = ''
  for (const [, body] of objects) {
    if (!/\/Type\s*\/Page[^s]/.test(body)) continue
    const fonts = new Map<string, FontMap>()
    const resMatch = /\/Font\s*<<([^>]*)>>/.exec(body)
    if (resMatch) {
      for (const m of resMatch[1].matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
        fonts.set(m[1], cmapForFont.get(m[2]) ?? EMPTY_FONT)
      }
    }
    const contentsRef = /\/Contents\s+(\d+) 0 R/.exec(body)
    const content = contentsRef
      ? streamOf(objects.get(contentsRef[1]) ?? '')
      : null
    if (!content) continue

    let current = EMPTY_FONT
    for (const m of content.matchAll(ops)) {
      if (m[1]) current = fonts.get(m[1]) ?? EMPTY_FONT
      else if (m[2]) text += decode(m[2], current)
      else if (m[3] !== undefined) {
        for (const h of m[3].matchAll(/<([0-9a-fA-F]+)>/g))
          text += decode(h[1], current)
      }
      // Positioning operators (Td/TD/Tm/T*) are consumed but add nothing:
      // Skia positions every glyph, and real spaces are their own glyphs.
    }
    text += '\n'
  }
  // Fold ligatures (ﬁ, ﬃ) to plain letters and collapse spacing so callers
  // can match ordinary strings.
  return text.normalize('NFKC').replace(/[ \t]+/g, ' ')
}

export function pdfPageCount(pdf: Buffer): number | null {
  const latin = pdf.toString('latin1')
  const m =
    /\/Type\s*\/Pages[^>]*\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*\/Type\s*\/Pages/.exec(
      latin
    )
  return m ? Number(m[1] ?? m[2]) : null
}
