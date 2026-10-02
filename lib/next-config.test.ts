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
 * The policy has three shapes, by where `next build` runs: off Vercel it
 * has no upgrade-insecure-requests, so a build served over plain http (a
 * local `next start` opened in Safari) keeps its own files; on a Vercel
 * production build it adds that directive; on a Vercel preview it also
 * allows the hosts the Vercel toolbar needs.
 */
const SITE_WIDE = '/(.*)'
const POLICY_OFF_VERCEL: Record<string, string[]> = {
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
}
const POLICY_ON_PRODUCTION: Record<string, string[]> = {
  ...POLICY_OFF_VERCEL,
  'upgrade-insecure-requests': [],
}
const POLICY_ON_PREVIEW: Record<string, string[]> = {
  ...POLICY_ON_PRODUCTION,
  'style-src': ["'self'", "'unsafe-inline'", 'https://vercel.live'],
  'font-src': ["'self'", 'https://vercel.live', 'https://assets.vercel.com'],
  'connect-src': ["'self'", 'https://vercel.live', 'wss://ws-us3.pusher.com'],
}

/** The two variables the policy reads, as a build would see them. */
interface BuildEnv {
  VERCEL?: string
  VERCEL_ENV?: string
}
const OFF_VERCEL: BuildEnv = {}
const PRODUCTION: BuildEnv = { VERCEL: '1', VERCEL_ENV: 'production' }
const PREVIEW: BuildEnv = { VERCEL: '1', VERCEL_ENV: 'preview' }

type HeaderRules = Awaited<
  ReturnType<
    NonNullable<(typeof import('../next.config'))['default']['headers']>
  >
>

/** The config's header rules as Next would build them in `env`. */
async function headerRules(env: BuildEnv): Promise<HeaderRules> {
  const { default: config } = await import('../next.config')
  const keys = ['VERCEL', 'VERCEL_ENV'] as const
  const saved = keys.map(key => process.env[key])
  for (const key of keys) {
    if (env[key] === undefined) delete process.env[key]
    else process.env[key] = env[key]
  }
  try {
    return (await config.headers?.()) ?? []
  } finally {
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key]
      else process.env[key] = saved[i]
    })
  }
}

async function siteWidePolicy(
  env: BuildEnv
): Promise<Record<string, string[]>> {
  const rule = (await headerRules(env)).find(r => r.source === SITE_WIDE)
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
  test('on Vercel production is the strict set with upgrade-insecure-requests', async () => {
    expect(await siteWidePolicy(PRODUCTION)).toEqual(POLICY_ON_PRODUCTION)
  })

  test('on a Vercel preview also allows the toolbar hosts', async () => {
    expect(await siteWidePolicy(PREVIEW)).toEqual(POLICY_ON_PREVIEW)
  })

  test('off Vercel has neither upgrade-insecure-requests nor the toolbar hosts', async () => {
    expect(await siteWidePolicy(OFF_VERCEL)).toEqual(POLICY_OFF_VERCEL)
  })

  test('refuses plugins in every shape', async () => {
    for (const env of [PRODUCTION, PREVIEW, OFF_VERCEL]) {
      expect((await siteWidePolicy(env))['object-src']).toEqual(["'none'"])
    }
  })

  // Next keeps the last matching rule's value for a header key, so on
  // BotID's challenge prefix the wrapper's one-directive policy replaces
  // the site-wide one. frame-src 'self' relies on that value; a BotID
  // upgrade that changes it, or a new rule that sets the header, fails here.
  test('is replaced only on BotID challenge paths, by frame-ancestors', async () => {
    const others = (await headerRules(PREVIEW))
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
