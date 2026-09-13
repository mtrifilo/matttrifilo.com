import type { CuratedRepo } from '@/content/open-source'

export interface OpenSourceProject {
  /** "owner/name", also the React key. */
  repo: string
  name: string
  url: string
  description: string
  language: string | null
  stars: number | null
  homepage: string | null
  /** ISO timestamp of the last push, or null when live data was unavailable. */
  pushedAt: string | null
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

export type RepoFetchResult =
  | { kind: 'ok'; data: GitHubRepoResponse }
  /** GitHub answered 404: the repo is gone or private. Not shown on the page. */
  | { kind: 'missing' }
  /** GitHub could not be reached or answered unexpectedly. Curated data only. */
  | { kind: 'unavailable' }

/** How long a fetched repo may be reused across builds before refetching. */
const REVALIDATE_SECONDS = 60 * 60
const FETCH_TIMEOUT_MS = 5000

export const repoSlug = (r: Pick<CuratedRepo, 'owner' | 'name'>) =>
  `${r.owner}/${r.name}`

/**
 * Keep only absolute http(s) URLs; GitHub's homepage field is free text.
 * Returns the author's trimmed text rather than url.href so "https://x.com"
 * is not normalised to "https://x.com/".
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  try {
    const { protocol } = new URL(trimmed)
    return protocol === 'http:' || protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}

/** Validate the external payload at the boundary instead of trusting a cast. */
export function isRepoResponse(json: unknown): json is GitHubRepoResponse {
  if (!json || typeof json !== 'object') return false
  const r = json as Record<string, unknown>
  return (
    typeof r.name === 'string' &&
    typeof r.html_url === 'string' &&
    (r.description === null || typeof r.description === 'string') &&
    (r.language === null || typeof r.language === 'string') &&
    typeof r.stargazers_count === 'number' &&
    (r.homepage === null ||
      r.homepage === undefined ||
      typeof r.homepage === 'string') &&
    typeof r.pushed_at === 'string'
  )
}

export function toProject(
  curated: CuratedRepo,
  data: GitHubRepoResponse | null
): OpenSourceProject {
  const repo = repoSlug(curated)
  const fallbackUrl = `https://github.com/${repo}`
  const liveDescription = data?.description?.trim() || null
  return {
    repo,
    name: data?.name || curated.name,
    url: data?.html_url || fallbackUrl,
    // Reviewed copy first; GitHub's description only when none was written.
    description: curated.summary?.trim() || liveDescription || '',
    language: data?.language ?? null,
    stars: data?.stargazers_count ?? null,
    homepage: safeHttpUrl(data?.homepage),
    pushedAt: data?.pushed_at ?? null,
  }
}

/**
 * Fetches one repo from GitHub's REST API at build time.
 *
 * The explicit `revalidate` matters: Next's Data Cache persists across Vercel
 * builds and an option-less fetch in a static route is cached for a year, so
 * without it the second deploy onward would never refetch. One hour still
 * dedupes within a build while guaranteeing fresh data on any later deploy.
 *
 * Failures never throw: a GitHub outage degrades the page to curated text
 * rather than breaking a deploy. They are logged so the build output (or,
 * for the hourly regeneration on Vercel, the runtime logs) shows which
 * repos were affected.
 */
export async function fetchRepo(repo: string): Promise<RepoFetchResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'matttrifilo.com (build)',
  }
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (res.status === 404) {
      console.error(
        `[open-source] GitHub has no repo ${repo} (deleted, renamed, or private); it will not be shown. Fix or remove it in content/open-source.ts.`
      )
      return { kind: 'missing' }
    }
    if (!res.ok) {
      console.warn(
        `[open-source] GitHub returned ${res.status} for ${repo}; using curated data only`
      )
      return { kind: 'unavailable' }
    }
    const json: unknown = await res.json()
    if (!isRepoResponse(json)) {
      console.warn(
        `[open-source] unexpected response shape for ${repo}; using curated data only`
      )
      return { kind: 'unavailable' }
    }
    return { kind: 'ok', data: json }
  } catch (error) {
    console.warn(
      `[open-source] could not reach GitHub for ${repo}; using curated data only`,
      error
    )
    return { kind: 'unavailable' }
  }
}

/**
 * All curated projects with live metadata, fetched in parallel, in curated
 * order. Missing repos are omitted. Logs one summary line when any repo
 * rendered without live data so a degraded build is visible at a glance.
 */
export async function getOpenSourceProjects(
  curated: readonly CuratedRepo[],
  fetchOne: (repo: string) => Promise<RepoFetchResult> = fetchRepo
): Promise<OpenSourceProject[]> {
  const results = await Promise.all(
    curated.map(entry => fetchOne(repoSlug(entry)))
  )
  const projects: OpenSourceProject[] = []
  const degraded: string[] = []
  curated.forEach((entry, i) => {
    const result = results[i]
    if (result.kind === 'missing') return
    if (result.kind === 'unavailable') degraded.push(repoSlug(entry))
    projects.push(toProject(entry, result.kind === 'ok' ? result.data : null))
  })
  if (degraded.length > 0) {
    console.warn(
      `[open-source] ${degraded.length} project(s) rendered without live GitHub data: ${degraded.join(', ')}`
    )
  }
  return projects
}
