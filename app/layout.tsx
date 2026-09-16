import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { ThemeProvider, Footer } from '@/components/layout'
import { HideOnRoutes } from '@/components/layout/hide-on-routes'
import Nav from '@/app/nav'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { JsonLd } from '@/components/seo/JsonLd'
import { generatePersonSchema } from '@/lib/seo/jsonld'
import { JOB_TITLE } from '@/lib/seo/identity'
import { HexBackground } from '@/components/background/HexBackground'
import { Analytics } from '@vercel/analytics/react'

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0e1a' },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL('https://matttrifilo.com'),
  title: {
    default: `Matt Trifilo | ${JOB_TITLE}`,
    template: '%s | Matt Trifilo',
  },
  description:
    'Engineering leader and agentic engineer. Blog posts about software development, technology, and engineering.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Matt Trifilo',
    // Images come from app/opengraph-image.tsx and app/twitter-image.tsx.
  },
  twitter: {
    card: 'summary_large_image',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <JsonLd data={generatePersonSchema()} />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <HexBackground />
          {/* svh, not screen (100vh): /ask sizes its column in svh, and on a
              phone with the toolbar out the two differ by the toolbar, which
              would give that page exactly the scroll it exists to avoid. */}
          <div className="flex flex-col min-h-svh relative z-10">
            <Nav assistantDisabled={isChatDisabled()} />
            <main className="flex-1">{children}</main>
            {/* /ask fills the viewport exactly (see --nav-height in
                globals.css); a footer below it would make the page scroll
                and carry the composer off screen. The approved design has
                none there. */}
            <HideOnRoutes routes={['/ask']}>
              <Footer />
            </HideOnRoutes>
          </div>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
