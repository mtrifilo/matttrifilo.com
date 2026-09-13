import { OG_ALT, OG_SIZE, renderOgCard } from '@/lib/og/card'

// Build-time social card for every route; see lib/og/card.tsx.
export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return renderOgCard()
}
