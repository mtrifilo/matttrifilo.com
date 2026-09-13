import { getBlogSlugs } from '@/lib/blog'
import { OG_ALT, OG_SIZE, renderOgCard } from '@/lib/og/card'

// A post page overrides `openGraph` (title, type, url), and Next replaces
// that object rather than merging it, which drops the root segment's
// file-based image. Declaring the card in this segment puts it back.
// Verified on a preview: without this file a post had twitter:image but
// no og:image. Same card as the site for now; per-post cards can replace
// renderOgCard() here without touching the root.
export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = 'image/png'

// Without this the image route is rendered on demand in a function,
// where the font files under node_modules are not guaranteed to be
// traced. With it the cards prerender at build, like the page itself.
export function generateStaticParams() {
  return getBlogSlugs().map(slug => ({ slug }))
}

export default function Image() {
  return renderOgCard()
}
