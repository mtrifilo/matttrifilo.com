import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'

// The card reads Geist's static TTFs from inside the geist package, a path
// its exports map does not promise. A dependency bump that moves them
// should fail here, not as an ENOENT during the Vercel build.
describe('social card fonts', () => {
  test('the Geist TTFs the renderer reads are present', () => {
    const dir = path.join(
      process.cwd(),
      'node_modules/geist/dist/fonts/geist-sans'
    )
    for (const file of ['Geist-Regular.ttf', 'Geist-Bold.ttf']) {
      expect(fs.existsSync(path.join(dir, file))).toBe(true)
    }
  })
})
