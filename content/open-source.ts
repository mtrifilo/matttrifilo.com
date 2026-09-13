/**
 * Projects shown on /open-source, in display order. Add a GitHub repo here
 * and it appears on the next deploy; description, language, stars and
 * last-push date are fetched from GitHub at build time (lib/github.ts).
 *
 * `summary` is the fallback description used when the GitHub API is
 * unavailable at build time or the repo has no description.
 */
export interface CuratedRepo {
  /** "owner/name" as it appears on GitHub. */
  repo: `${string}/${string}`
  summary: string
}

export const openSourceRepos: readonly CuratedRepo[] = [
  {
    repo: 'mtrifilo/decant',
    summary: 'CLI to transform your clipboard into markdown for LLM context.',
  },
  {
    repo: 'mtrifilo/psychic-homily-web',
    summary:
      'A website to document and amplify new music releases, shows, and cultural events from Arizona musicians and beyond.',
  },
]
