/**
 * Where the RSS feed is served (app/feed.xml/route.ts), and the metadata
 * that advertises it. Kept apart from rss-feed.ts so a page or the footer
 * can name the feed without importing the MDX compiler.
 */
export const FEED_PATH = '/feed.xml'

/**
 * For `alternates.types`. The root layout sets it for every page, but a
 * page that declares its own `alternates` (a canonical URL, say) replaces
 * the layout's whole object, so such a page spreads this in beside its
 * canonical. lib/seo/rss-feed.test.ts fails for a page that does not.
 */
export const FEED_ALTERNATE_TYPES = { 'application/rss+xml': FEED_PATH }
