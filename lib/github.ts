import type { CuratedRepo } from '@/content/open-source'

export interface OpenSourceProject {
  repo: string
  name: string
  url: string
  description: string
  language: string | null
  stars: number | null
  homepage: string | null
  /** ISO date of the last push, or null when live data was unavailable. */
  pushedAt: string | null
  /** False when GitHub could not be reached and only curated data is shown. */
  live: boolean
}

/** The subset of GitHub's repository response this site reads. */
export interface GitHubRepoResponse {
  name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  homepage: string | null
  pushed_at: string
}

export function toProject(
  curated: CuratedRepo,
  data: GitHubRepoResponse | null
): OpenSourceProject {
  const [, name] = curated.repo.split('/')
  const url = `https://github.com/${curated.repo}`
  if (!data) {
    return {
      repo: curated.repo,
      name,
      url,
      description: curated.summary,
      language: null,
      stars: null,
      homepage: null,
      pushedAt: null,
      live: false,
    }
  }
  return {
    repo: curated.repo,
    name: data.name || name,
    url: data.html_url || url,
    description: data.description?.trim() || curated.summary,
    language: data.language,
    stars: data.stargazers_count,
    homepage: data.homepage?.trim() || null,
    pushedAt: data.pushed_at,
    live: true,
  }
}

/**
 * Fetches one repo from GitHub's public REST API at build time. Unauthenticated
 * requests are limited to 60/hour per IP, which is plenty for a handful of
 * repos per deploy; set GITHUB_TOKEN in the build environment to raise it.
 *
 * Network or API failures return null rather than throwing: a GitHub outage
 * should degrade the page to curated text, not break a deploy. The failure
 * is logged so it is visible in the build output.
 */
async function fetchRepo(repo: string): Promise<GitHubRepoResponse | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'matttrifilo.com (build)',
  }
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers })
    if (!res.ok) {
      console.warn(
        `[open-source] GitHub returned ${res.status} for ${repo}; using curated summary`
      )
      return null
    }
    return (await res.json()) as GitHubRepoResponse
  } catch (error) {
    console.warn(
      `[open-source] could not reach GitHub for ${repo}; using curated summary`,
      error
    )
    return null
  }
}

/** All curated projects with live metadata, fetched in parallel. */
export async function getOpenSourceProjects(
  curated: readonly CuratedRepo[]
): Promise<OpenSourceProject[]> {
  const responses = await Promise.all(
    curated.map(entry => fetchRepo(entry.repo))
  )
  return curated.map((entry, i) => toProject(entry, responses[i]))
}

/** "March 2026" from an ISO timestamp, in UTC so the month never shifts. */
export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
