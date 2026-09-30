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

/**
 * The site-wide Content-Security-Policy, read from the config Next loads
 * (BotID's wrapper included) rather than from the source text. Every
 * directive is pinned to its exact sources, so a new host is a deliberate
 * edit here as well as in next.config.ts, not something a refactor slips in.
 */
const SITE_WIDE = '/(.*)'
const EXPECTED_POLICY: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", 'https://vercel.live'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://vercel.com',
    'https://vercel.live',
  ],
  'font-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'self'", 'https://vercel.live'],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': [],
}

async function siteWidePolicy(): Promise<Record<string, string[]>> {
  const { default: config } = await import('../next.config')
  const rules = (await config.headers?.()) ?? []
  const rule = rules.find(r => r.source === SITE_WIDE)
  const header = rule?.headers.find(h => h.key === 'Content-Security-Policy')
  if (!header) throw new Error(`no Content-Security-Policy on ${SITE_WIDE}`)
  const policy: Record<string, string[]> = {}
  for (const directive of header.value.split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/)
    if (!name) continue
    if (name in policy) throw new Error(`${name} appears twice`)
    policy[name] = sources
  }
  return policy
}

describe('the Content-Security-Policy', () => {
  test('is exactly the pinned set of directives and sources', async () => {
    expect(await siteWidePolicy()).toEqual(EXPECTED_POLICY)
  })

  test('refuses plugins and upgrades insecure requests', async () => {
    const policy = await siteWidePolicy()
    expect(policy['object-src']).toEqual(["'none'"])
    expect(policy['upgrade-insecure-requests']).toEqual([])
  })

  // Next keeps the last matching rule's value for a header key, so on
  // BotID's challenge prefix the wrapper's one-directive policy replaces
  // the site-wide one. frame-src 'self' relies on that value; a BotID
  // upgrade that changes it, or a new rule that sets the header, fails here.
  test('is replaced only on BotID challenge paths, by frame-ancestors', async () => {
    const { default: config } = await import('../next.config')
    const rules = (await config.headers?.()) ?? []
    const others = rules
      .filter(r => r.source !== SITE_WIDE)
      .flatMap(r =>
        r.headers
          .filter(h => h.key === 'Content-Security-Policy')
          .map(h => ({ source: r.source, value: h.value }))
      )
    expect(others).toEqual([
      {
        source: expect.stringMatching(/^\/[0-9a-f-]{36}\/[0-9a-f-]{36}\//),
        value: "frame-ancestors 'self'",
      },
    ])
  })
})
