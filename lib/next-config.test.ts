import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The persistent build cache is off in next.config.ts because a restored
 * cache served a stale stylesheet on a preview (MTC-62). Next treats an
 * unknown `experimental` key as a warning, not an error, so an upgrade that
 * renamed the option would turn the cache back on without failing anything
 * else. These tests turn that into a red run instead.
 */
const OPTION = 'turbopackFileSystemCacheForBuild'
const root = process.cwd()

describe('the Turbopack build cache switch', () => {
  test('is off in next.config.ts', () => {
    const config = readFileSync(join(root, 'next.config.ts'), 'utf8')
    expect(config).toMatch(new RegExp(`${OPTION}:\\s*false`))
  })

  test('is an option the installed Next still recognises', () => {
    const schema = readFileSync(
      join(root, 'node_modules/next/dist/server/config-schema.js'),
      'utf8'
    )
    expect(schema).toContain(OPTION)
  })
})
