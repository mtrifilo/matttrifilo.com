import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * The career assistant reads content/knowledge/*.md from the filesystem
   * at request time (lib/knowledge). Next's tracer follows imports, and
   * these are data files nothing imports, so without this they are left
   * out of the serverless bundle and the route throws ENOENT in
   * production while passing every check locally.
   *
   * Routes listed here: /api/chat is the chat route (being built on its
   * own branch) and /ask is the page that calls it (MTC-33). Keep this in
   * step with wherever the knowledge base is loaded; a preview deploy is
   * the only thing that actually proves the files shipped.
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
              "frame-src https://vercel.live",
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

export default nextConfig
