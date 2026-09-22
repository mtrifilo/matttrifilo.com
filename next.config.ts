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
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-slot',
    ],
  },
  async headers() {
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://vercel.live",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://vercel.com https://vercel.live",
              "font-src 'self'",
              "worker-src 'self' blob:",
              "connect-src 'self'",
              // 'self' for BotID's same-origin challenge path (MTC-34), which
              // the wrapper below marks frameable by this origin.
              "frame-src 'self' https://vercel.live",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
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
