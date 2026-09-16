import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'

const nextConfig: NextConfig = {
  /**
   * The career assistant reads content/knowledge/<topic>/*.md from the
   * filesystem at request time (lib/knowledge). Next's tracer follows
   * imports, and these are data files nothing imports, so without this
   * they are left out of the serverless bundle and the route throws ENOENT
   * in production while passing every check locally.
   *
   * Routes listed here: /api/chat is the chat route, and /ask is the page
   * that calls it. Nothing renders a corpus document, so no other route
   * needs the files. Keep this in step with wherever the corpus is loaded;
   * a preview deploy is the only thing that actually proves they shipped.
   */
  outputFileTracingIncludes: {
    '/api/chat': ['./content/knowledge/**/*.md'],
    '/ask': ['./content/knowledge/**/*.md'],
  },
  experimental: {
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
