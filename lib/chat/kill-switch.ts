import type { EnvSource } from '@/lib/env'

/**
 * The kill switch for Matt's Career Assistant. Any other value, including
 * unset, leaves the assistant serving.
 *
 * One flag hides everything: the chat route refuses with `disabled`, and the
 * homepage panel, the nav entry, the résumé button, the sitemap entries, the
 * /ask page and the /knowledge corpus pages are not rendered. It lives in its own module with no
 * imports beyond a type so the pages and the layout can read it without
 * pulling the validator, and through it the knowledge index, into their
 * module graph. Pages read `process.env` at render, which for a static page
 * is build time, so changing the value on Vercel needs a redeploy.
 */
export function isChatDisabled(env: EnvSource = process.env): boolean {
  return env.CHAT_DISABLED === '1'
}
