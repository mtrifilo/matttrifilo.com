import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { ThemeProvider, Footer } from '@/components/layout'
import Nav from '@/app/nav'
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
          <div className="flex flex-col min-h-screen relative z-10">
            <Nav />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
