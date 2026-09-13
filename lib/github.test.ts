import { describe, expect, test } from 'bun:test'
import { formatMonthYear, toProject, type GitHubRepoResponse } from './github'
import { openSourceRepos } from '@/content/open-source'

const curated = {
  repo: 'mtrifilo/decant' as const,
  summary: 'Fallback summary.',
}
const live: GitHubRepoResponse = {
  name: 'decant',
  html_url: 'https://github.com/mtrifilo/decant',
  description: 'CLI to transform your clipboard into markdown for LLM context.',
  language: 'TypeScript',
  stargazers_count: 2,
  homepage: '',
  pushed_at: '2026-03-07T18:22:10Z',
}

describe('toProject', () => {
  test('maps a live GitHub response', () => {
    const p = toProject(curated, live)
    expect(p).toMatchObject({
      name: 'decant',
      language: 'TypeScript',
      stars: 2,
      homepage: null,
      live: true,
    })
    expect(p.description).toBe(
      'CLI to transform your clipboard into markdown for LLM context.'
    )
  })

  test('falls back to curated data when GitHub is unavailable', () => {
    const p = toProject(curated, null)
    expect(p).toMatchObject({
      name: 'decant',
      url: 'https://github.com/mtrifilo/decant',
      description: 'Fallback summary.',
      language: null,
      stars: null,
      pushedAt: null,
      live: false,
    })
  })

  test('uses the curated summary when the repo has no description', () => {
    expect(toProject(curated, { ...live, description: null }).description).toBe(
      'Fallback summary.'
    )
    expect(
      toProject(curated, { ...live, description: '   ' }).description
    ).toBe('Fallback summary.')
  })
})

describe('formatMonthYear', () => {
  test('is timezone-stable', () => {
    expect(formatMonthYear('2026-03-01T00:30:00Z')).toBe('March 2026')
  })
})

describe('curated list', () => {
  test('every entry is owner/name with a summary', () => {
    for (const entry of openSourceRepos) {
      expect(entry.repo).toMatch(/^[\w.-]+\/[\w.-]+$/)
      expect(entry.summary.length).toBeGreaterThan(10)
    }
  })
})
