import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JOB_TITLE, TAGLINE } from '@/lib/seo/identity'
import { honeycombDataUrl } from './honeycomb'

/**
 * The one social card, generated at build time by app/opengraph-image.tsx
 * and app/twitter-image.tsx. It draws the identity from lib/seo/identity.ts
 * so the shared-link preview can no longer drift from the page it points to
 * (MTC-28 replaced a hand-made JPEG that had done exactly that).
 */
export const OG_SIZE = { width: 1200, height: 630 }
export const OG_ALT = `Matt Trifilo, ${JOB_TITLE}`

const DOMAIN = 'matttrifilo.com'

// Dark-theme site tokens (app/globals.css .dark). HEX_RADIUS mirrors the
// canvas grid's radius in components/background/hex-renderer.ts; it is a
// separate literal on purpose so this build-time module never imports
// the browser renderer.
const BACKGROUND = '#0a0e1a'
const FOREGROUND = '#f8fafc'
const MUTED = '#94a3b8'
const ACCENT = '#60a5fa'
const HEX_RADIUS = 40

// Geist is the site typeface; the npm package ships static TTFs the image
// renderer can consume (it cannot read woff2). dist/fonts is not in the
// package's exports map, so lib/og/card.test.ts asserts the files exist.
const GEIST_DIR = join(
  process.cwd(),
  'node_modules/geist/dist/fonts/geist-sans'
)
const fonts = Promise.all([
  readFile(join(GEIST_DIR, 'Geist-Regular.ttf')),
  readFile(join(GEIST_DIR, 'Geist-Bold.ttf')),
])

export async function renderOgCard(): Promise<ImageResponse> {
  const [regular, bold] = await fonts
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BACKGROUND,
        backgroundImage: honeycombDataUrl({
          ...OG_SIZE,
          radius: HEX_RADIUS,
          stroke: 'rgba(96, 165, 250, 0.16)',
        }),
        fontFamily: 'Geist',
        color: FOREGROUND,
      }}
    >
      {/* Soft dark pool behind the text, echoing the site's reading veil. */}
      <div
        style={{
          position: 'absolute',
          left: 200,
          top: 90,
          width: 800,
          height: 450,
          borderRadius: 400,
          background:
            'radial-gradient(closest-side, rgba(10, 14, 26, 0.96), rgba(10, 14, 26, 0))',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2 }}>
          Matt Trifilo
        </div>
        <div style={{ fontSize: 36, color: MUTED }}>{JOB_TITLE}</div>
        <div
          style={{
            fontSize: 28,
            color: FOREGROUND,
            opacity: 0.9,
            marginTop: 22,
          }}
        >
          {TAGLINE}
        </div>
        <div style={{ fontSize: 26, color: ACCENT, marginTop: 10 }}>
          {DOMAIN}
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Geist', data: regular, weight: 400, style: 'normal' },
        { name: 'Geist', data: bold, weight: 700, style: 'normal' },
      ],
    }
  )
}
