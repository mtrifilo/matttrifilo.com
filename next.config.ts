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
   * Routes listed here: /api/chat is the chat route (being built on its
   * own branch), /ask is the page that calls it (MTC-33), and
   * /knowledge/** are the pages that publish the corpus. Those pages are
   * statically generated today, so they read the files at build time — but
   * they are listed anyway, because which routes are static is a decision
   * that can change without anyone remembering this file. Keep this in
   * step with wherever the corpus is loaded; a preview deploy is the only
   * thing that actually proves the files shipped.
   */
  outputFileTracingIncludes: {
    '/api/chat': ['./content/knowledge/**/*.md'],
    '/ask': ['./content/knowledge/**/*.md'],
    '/knowledge/**': ['./content/knowledge/**/*.md'],
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
              'frame-src https://vercel.live',
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
// proxy its classification calls (MTC-34), which is what keeps the CSP
// above unchanged: nothing new is loaded from a third-party host.
export default withBotId(nextConfig)
