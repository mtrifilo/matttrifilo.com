import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'

const nextConfig: NextConfig = {
  /**
   * The career assistant reads content/knowledge/<topic>/*.md from the
   * filesystem at request time (lib/knowledge), and the published eval
   * records under evals/results/ are read the same way (lib/evals/results).
   * Next's tracer follows imports, and these are data files nothing imports,
   * so without this they are left out of the serverless bundle and the route
   * throws ENOENT, or publishes nothing, in production while passing every
   * check locally.
   *
   * Routes listed here: /api/chat is the chat route and /ask is the page
   * that calls it; /, /ask and /ask/evals are the three pages that read a
   * published record. Nothing renders a corpus document, so no other route
   * needs the markdown. Keep this in step with wherever either directory is
   * loaded; a preview deploy is the only thing that actually proves they
   * shipped.
   */
  outputFileTracingIncludes: {
    '/api/chat': ['./content/knowledge/**/*.md'],
    '/ask': ['./content/knowledge/**/*.md', './evals/results/*.json'],
    '/': ['./evals/results/*.json'],
    '/ask/evals': ['./evals/results/*.json'],
  },
  /**
   * This app is its own workspace. Without a root, Next infers one from
   * lockfiles found walking up from this directory, and on a machine with a
   * stray bun.lock above the repository (the home directory, say) every
   * build warns that it ignored that file. Next also uses this value as
   * outputFileTracingRoot.
   */
  turbopack: {
    root: __dirname,
  },
  experimental: {
    /**
     * Off for every `next build`, local and CI included, not only on Vercel.
     *
     * Vercel keys its build cache by branch and gives a branch's first build
     * the last production deployment's cache. With this on, Turbopack then
     * reused a stale stylesheet: PR #41's first preview served main's CSS
     * under the branch's JavaScript, and the follow-up row it added had no
     * rules at all (MTC-62, 2026-09-22; the same symptom on 16.3.0 is in
     * vercel/next.js discussion 87283). Scoping the switch to previews was
     * rejected because a stale production build is the same defect.
     *
     * Cost, measured 2026-09-22: CI's cold `bun run build` step took 22 s
     * (run 35759355529) and a cache-free Vercel build 1 minute including
     * install, so the cache buys little here and a wrong preview costs a
     * review cycle.
     *
     * An unknown `experimental` key only warns, so a Next upgrade that
     * renames this one would silently turn the cache back on;
     * lib/next-config.test.ts fails instead. Revisit when a Next release
     * names the invalidation fix.
     */
    turbopackFileSystemCacheForBuild: false,
    optimizePackageImports: ['lucide-react', 'radix-ui'],
  },
  async headers() {
    const previewOnly = (sources: string) =>
      process.env.VERCEL_ENV === 'preview' ? ` ${sources}` : ''
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
          },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          /**
           * 'unsafe-inline' stays in script-src because the pages are
           * prerendered. Next inlines its bootstrap and flight-data scripts
           * (self.__next_f) in every page, and next-themes inlines the script
           * that sets the theme class before first paint. A prerendered page
           * cannot carry a per-request nonce, and those scripts differ by page
           * and by build, so hashes do not fit either. Next's experimental
           * SRI does not help: it hashes the external chunks only, not these
           * inline scripts. The JSON-LD tag is a data block the browser never
           * runs, so it needs none of this.
           *
           * Removing it takes a proxy.ts that mints a nonce per request and
           * sets the policy, with 'nonce-...' in script-src, on the forwarded
           * request as well as the response: Next reads the nonce from the
           * request's Content-Security-Policy header and stamps its own
           * scripts with it. This fixed header cannot carry a per-request
           * value, so the policy moves there. The same nonce goes to
           * ThemeProvider. Every page then renders per request instead of
           * being served prerendered. Keeping it is acceptable with /ask live
           * (Matt, 2026-10-01): a visitor's question renders as React text,
           * and any HTML in the model's Markdown is parsed and then stripped
           * of scripts and event handlers by Streamdown's sanitizer, so
           * neither opens a path to an inline script.
           *
           * object-src 'none' refuses plugins outright rather than inheriting
           * default-src. upgrade-insecure-requests has the browser request a
           * page's subresources, frames and form posts over https://, so none
           * of them travels in the clear. On a page served over plain http
           * the page's own files are upgraded too, and Safari then loads none
           * of its scripts, styles or images, so a local `next start` on
           * http://127.0.0.1 opened in Safari or any WebKit browser would
           * break. It is therefore sent only where VERCEL is set, the test
           * app/layout.tsx uses for the analytics script. `next build` fixes
           * the value in routes-manifest.json (`next dev` reads it live), and
           * Vercel's builds set VERCEL, as do `vercel dev` and a local
           * `vercel build`, so those carry it too. On production it is a
           * second safeguard, since Vercel already sends
           * Strict-Transport-Security there.
           *
           * vercel.live and vercel.com in script-src, img-src and frame-src
           * serve the Vercel toolbar and Comments. The rest of what Vercel's
           * toolbar documentation lists ("Using a Content Security Policy",
           * vercel.com/docs/vercel-toolbar/managing-toolbar) is added only
           * where VERCEL_ENV is 'preview' (Matt, 2026-10-01), so production
           * keeps the narrower policy: the hosts previewOnly adds to
           * style-src, font-src and connect-src below. VERCEL_ENV, like
           * VERCEL, is fixed at `next build`.
           */
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://vercel.live",
              "style-src 'self' 'unsafe-inline'" +
                previewOnly('https://vercel.live'),
              "img-src 'self' data: blob: https://vercel.com https://vercel.live",
              "font-src 'self'" +
                previewOnly('https://vercel.live https://assets.vercel.com'),
              "worker-src 'self' blob:",
              "connect-src 'self'" +
                previewOnly('https://vercel.live wss://ws-us3.pusher.com'),
              "object-src 'none'",
              // 'self' for BotID's same-origin challenge path (MTC-34), which
              // the wrapper below marks frameable by this origin.
              "frame-src 'self' https://vercel.live",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              ...(process.env.VERCEL ? ['upgrade-insecure-requests'] : []),
            ].join('; '),
          },
        ],
      },
    ]
  },
  /**
   * The project's production alias on vercel.app serves the same pages as
   * the apex, so search engines would index a second copy. Every path on
   * that one host moves permanently (308) to the same path on the apex.
   *
   * Next compiles a `has` value as a regular expression anchored at both
   * ends (`new RegExp(`^${value}$`)` in matchHas; the `redirects` docs call
   * it "a regex like string"), and compares it with the request's host,
   * lowercased and without the port. The dots are escaped so the pattern
   * matches this one host and nothing else. Preview deployments answer on
   * other *.vercel.app hosts and the browser and accessibility checks on
   * 127.0.0.1, so none of them is redirected. lib/next-config.test.ts runs
   * the rule through Next's own matcher.
   */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'matttrifilocom\\.vercel\\.app' }],
        destination: 'https://matttrifilo.com/:path*',
        permanent: true,
      },
    ]
  },
}

// Adds the same-origin rewrites that serve BotID's challenge script and
// proxy its classification calls (MTC-34), so nothing is loaded from a new
// host and script-src/connect-src above stay as they are. It also appends
// a header rule for its own path prefix (X-Frame-Options SAMEORIGIN and
// frame-ancestors 'self') after the site-wide rule above. Next applies
// header rules in order and the last match overwrites a key (its
// resolve-routes), so on that prefix the wrapper's two headers win and the
// rest of the site-wide set survives; that is why frame-src carries 'self'.
export default withBotId(nextConfig)
