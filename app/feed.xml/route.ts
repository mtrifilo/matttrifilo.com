import { buildRssFeed } from '@/lib/seo/rss-feed'

// Prerendered at build time, like the blog pages it is made from: the posts
// are files in the deployment, so the feed only changes when they do.
export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return new Response(await buildRssFeed(), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
