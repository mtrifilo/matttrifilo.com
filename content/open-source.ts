/**
 * Projects shown on /open-source, in display order.
 *
 * Content conventions in this repo: prose lives as markdown under
 * content/<type>/ (blog posts); structured lists live as typed modules in
 * content/ (this file); app/*\/page.tsx renders and holds no data.
 *
 * What is live vs curated: `summary` is the description shown on the page,
 * so the copy is reviewed here rather than pulled unedited from GitHub. If
 * it is omitted, GitHub's repository description is used. Language, stars,
 * last-push date and homepage are always fetched from GitHub at build time
 * (lib/github.ts). The page is regenerated on deploy and then at most once
 * an hour on Vercel, so the numbers stay reasonably fresh between deploys.
 *
 * A repo that GitHub reports as missing (deleted, renamed without redirect,
 * or made private) is left off the page and logged at build time; remove or
 * fix its entry here.
 *
 * Rate limits: unauthenticated GitHub requests are limited per egress IP,
 * which Vercel shares with other tenants. Set GITHUB_TOKEN in the Vercel
 * project's Production environment (it applies to builds and to the hourly
 * regeneration; any token with public read access) so metadata cannot
 * silently drop out. CI already passes its workflow token.
 */
export interface CuratedRepo {
  owner: string
  name: string
  /** Reviewed one-line description. Falls back to GitHub's when omitted. */
  summary?: string
  /**
   * Whether Matt's Career Assistant may fetch this repository's recent
   * activity (MTC-45).
   *
   * The assistant's allowlist is derived from this flag rather than from the
   * list itself, so a project can be shown on /open-source without becoming
   * something the chat route will reach out to GitHub for. A repository with
   * the flag needs a `summary`: the assistant shows that line to the model as
   * the repository's description, and GitHub's own text is never substituted
   * for it. See lib/chat/repositories.ts.
   */
  assistant?: true
}

export const openSourceRepos: readonly CuratedRepo[] = [
  {
    owner: 'mtrifilo',
    name: 'decant',
    summary: 'CLI to transform your clipboard into markdown for LLM context.',
    assistant: true,
  },
  {
    owner: 'mtrifilo',
    name: 'psychic-homily-web',
    summary:
      'A website to document and amplify new music releases, shows, and cultural events from Arizona musicians and beyond.',
    assistant: true,
  },
  {
    owner: 'mtrifilo',
    name: 'matttrifilo.com',
    summary:
      'The source of this site: a Next.js portfolio with a blog, a résumé, an open-source page, and an AI career assistant, built with React, Tailwind and Bun on Vercel.',
    assistant: true,
  },
]
