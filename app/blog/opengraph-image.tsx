import { OG_ALT, OG_SIZE, renderOgCard } from '@/lib/og/card'

// app/blog/page.tsx overrides `openGraph`, and Next replaces that object
// rather than merging it, so the root segment's file-based image is lost
// here (verified against Next's resolve-metadata: file images are only
// restored from the same segment). Declaring the card in this segment
// puts it back; same card as the site.
export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return renderOgCard()
}
