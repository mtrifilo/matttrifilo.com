import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkCustomRoutes } from 'next/dist/lib/load-custom-routes'
import { getRedirectStatus } from 'next/dist/lib/redirect-status'
import { buildCustomRoute } from 'next/dist/server/lib/router-utils/filesystem'
import {
  matchHas,
  prepareDestination,
} from 'next/dist/shared/lib/router/utils/prepare-destination'

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

/**
 * The redirect that moves the production alias on vercel.app to the apex
 * (MTC-13). The rule is run through Next's own route builder and `has`
 * matcher, the functions its router calls on every request, so a pattern
 * that also caught a preview deployment or 127.0.0.1 (where the browser and
 * accessibility checks run) fails here. What this cannot reach: on Vercel
 * the rule is served by Vercel's routing layer from the build output, not
 * by these functions, so the production `curl -sI` checks are the proof
 * for the deployed site.
 */
const ALIAS_HOST = 'matttrifilocom.vercel.app'

type RedirectRules = Awaited<
  ReturnType<
    NonNullable<(typeof import('../next.config'))['default']['redirects']>
  >
>

async function redirectRules(): Promise<RedirectRules> {
  const { default: config } = await import('../next.config')
  return (await config.redirects?.()) ?? []
}

/** Where Next would send a request for `path` on `host`, or null. */
async function redirectFor(
  host: string | undefined,
  path: string,
  query: Record<string, string> = {}
): Promise<{ status: number; location: string } | null> {
  for (const rule of await redirectRules()) {
    const params = buildCustomRoute('redirect', rule).match(path)
    if (!params) continue
    const request = { headers: host === undefined ? {} : { host } }
    const hostParams = matchHas(
      request as unknown as Parameters<typeof matchHas>[0],
      query,
      rule.has,
      rule.missing
    )
    if (!hostParams) continue
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: rule.destination,
      params: { ...params, ...hostParams },
      query,
    })
    const { protocol, hostname, port, pathname } = parsedDestination
    const location = new URL(
      `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname || '/'}`
    )
    for (const [key, value] of Object.entries(parsedDestination.query))
      location.searchParams.set(key, String(value))
    return { status: getRedirectStatus(rule), location: location.href }
  }
  return null
}

describe('the vercel.app alias redirect', () => {
  test('is the one pinned rule: every path on the alias, permanently, to the apex', async () => {
    expect(await redirectRules()).toEqual([
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'matttrifilocom\\.vercel\\.app' }],
        destination: 'https://matttrifilo.com/:path*',
        permanent: true,
      },
    ])
  })

  test('passes the checks `next build` runs on custom routes', async () => {
    // checkCustomRoutes logs and calls process.exit(1) on an invalid rule.
    const exit = process.exit
    process.exit = ((code?: number) => {
      throw new Error(`checkCustomRoutes exited with ${code}`)
    }) as typeof process.exit
    try {
      const rules = await redirectRules()
      expect(() => checkCustomRoutes(rules, 'redirect')).not.toThrow()
    } finally {
      process.exit = exit
    }
  })

  test('sends the alias to the same path and query on the apex with a 308', async () => {
    expect(await redirectFor(ALIAS_HOST, '/')).toEqual({
      status: 308,
      location: 'https://matttrifilo.com/',
    })
    expect(await redirectFor(ALIAS_HOST, '/blog/a-post')).toEqual({
      status: 308,
      location: 'https://matttrifilo.com/blog/a-post',
    })
    expect(await redirectFor(ALIAS_HOST, '/feed.xml', { a: '1' })).toEqual({
      status: 308,
      location: 'https://matttrifilo.com/feed.xml?a=1',
    })
  })

  test('matches the alias however the Host header spells it', async () => {
    // Next lowercases the host and drops the port before matching.
    expect(await redirectFor('MattTrifiloCom.Vercel.App', '/')).not.toBeNull()
    expect(await redirectFor(`${ALIAS_HOST}:443`, '/')).not.toBeNull()
  })

  test.each([
    ['the apex', 'matttrifilo.com'],
    ['www', 'www.matttrifilo.com'],
    // A real branch preview host (PR #110's), and a deployment-hash shape.
    [
      'a branch preview',
      'matttrifilocom-git-feature-mtc-1-c00eab-matts-projects-722d5204.vercel.app',
    ],
    [
      'a deployment preview',
      'matttrifilocom-abc123def-matts-projects-722d5204.vercel.app',
    ],
    ['loopback', '127.0.0.1'],
    ['loopback with a port', '127.0.0.1:3000'],
    ['localhost', 'localhost:3000'],
    // An unescaped dot in the pattern would match any character here.
    ['the alias with its dots replaced', 'matttrifilocom-vercel-app'],
    ['a host that starts with the alias', `${ALIAS_HOST}.example.test`],
    ['a host that ends with the alias', `preview.${ALIAS_HOST}`],
  ])('leaves %s alone', async (_, host) => {
    for (const path of ['/', '/blog', '/api/chat']) {
      expect(await redirectFor(host, path)).toBeNull()
    }
  })

  test('leaves a request with no Host header alone', async () => {
    expect(await redirectFor(undefined, '/')).toBeNull()
  })
})
