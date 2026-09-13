import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { openSourceRepos } from '@/content/open-source'
import {
  fetchRepo,
  getOpenSourceProjects,
  isRepoResponse,
  safeHttpUrl,
  toProject,
  type GitHubRepoResponse,
} from './github'

const curated = {
  owner: 'mtrifilo',
  name: 'decant',
  summary: 'Curated summary.',
}
const live: GitHubRepoResponse = {
  name: 'decant',
  html_url: 'https://github.com/mtrifilo/decant',
  description: 'GitHub description.',
  language: 'TypeScript',
  stargazers_count: 2,
  homepage: '',
  pushed_at: '2026-03-07T18:22:10Z',
}

describe('toProject', () => {
  test('maps live metadata and prefers the curated summary as the description', () => {
    const p = toProject(curated, live)
    expect(p).toMatchObject({
      repo: 'mtrifilo/decant',
      name: 'decant',
      description: 'Curated summary.',
      language: 'TypeScript',
      stars: 2,
      homepage: null,
      pushedAt: live.pushed_at,
    })
  })

  test('uses GitHub description when no summary is curated', () => {
    expect(
      toProject({ owner: 'mtrifilo', name: 'decant' }, live).description
    ).toBe('GitHub description.')
  })

  test('falls back to curated data when GitHub is unavailable', () => {
    expect(toProject(curated, null)).toEqual({
      repo: 'mtrifilo/decant',
      name: 'decant',
      url: 'https://github.com/mtrifilo/decant',
      description: 'Curated summary.',
      language: null,
      stars: null,
      homepage: null,
      pushedAt: null,
    })
  })
})

describe('safeHttpUrl', () => {
  test('keeps absolute http(s) URLs and drops everything else', () => {
    expect(safeHttpUrl('https://psychichomily.com')).toBe(
      'https://psychichomily.com'
    )
    expect(safeHttpUrl(' http://example.com/x ')).toBe('http://example.com/x')
    expect(safeHttpUrl('https://x.com')).toBe('https://x.com')
    expect(safeHttpUrl('psychichomily.com')).toBeNull()
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })
})

describe('isRepoResponse', () => {
  test('accepts the GitHub shape and rejects drift', () => {
    expect(isRepoResponse(live)).toBe(true)
    expect(isRepoResponse({ ...live, pushed_at: 123 })).toBe(false)
    expect(isRepoResponse({ ...live, stargazers_count: undefined })).toBe(false)
    expect(isRepoResponse(null)).toBe(false)
  })
})

describe('fetchRepo (network failures never throw)', () => {
  afterEach(() => {
    const spied = globalThis.fetch as unknown as { mockRestore?: () => void }
    spied.mockRestore?.()
  })

  const stub = (impl: () => Promise<Response>) =>
    spyOn(globalThis, 'fetch').mockImplementation(
      impl as unknown as typeof fetch
    )

  test('404 → missing', async () => {
    stub(async () => new Response('', { status: 404 }))
    expect(await fetchRepo('mtrifilo/gone')).toEqual({ kind: 'missing' })
  })

  test('503 → unavailable', async () => {
    stub(async () => new Response('', { status: 503 }))
    expect(await fetchRepo('mtrifilo/decant')).toEqual({ kind: 'unavailable' })
  })

  test('network error → unavailable', async () => {
    stub(async () => {
      throw new Error('ECONNRESET')
    })
    expect(await fetchRepo('mtrifilo/decant')).toEqual({ kind: 'unavailable' })
  })

  test('200 with an unexpected body → unavailable', async () => {
    stub(async () => Response.json({ hello: 'world' }))
    expect(await fetchRepo('mtrifilo/decant')).toEqual({ kind: 'unavailable' })
  })

  test('200 with the expected body → ok', async () => {
    stub(async () => Response.json(live))
    expect(await fetchRepo('mtrifilo/decant')).toEqual({
      kind: 'ok',
      data: live,
    })
  })
})

describe('getOpenSourceProjects', () => {
  test('keeps curated order, omits missing repos, degrades unavailable ones', async () => {
    const list = [
      { owner: 'o', name: 'a', summary: 'A' },
      { owner: 'o', name: 'gone', summary: 'G' },
      { owner: 'o', name: 'b', summary: 'B' },
    ]
    const projects = await getOpenSourceProjects(list, async repo => {
      if (repo === 'o/gone') return { kind: 'missing' }
      if (repo === 'o/b') return { kind: 'unavailable' }
      return {
        kind: 'ok',
        data: { ...live, name: 'a', html_url: 'https://github.com/o/a' },
      }
    })
    expect(projects.map(p => p.repo)).toEqual(['o/a', 'o/b'])
    expect(projects[0].stars).toBe(2)
    expect(projects[1]).toMatchObject({
      description: 'B',
      stars: null,
      pushedAt: null,
    })
  })
})

describe('curated list', () => {
  test('is non-empty, well-formed, and has no duplicates', () => {
    expect(openSourceRepos.length).toBeGreaterThan(0)
    const slugs = openSourceRepos.map(r => `${r.owner}/${r.name}`)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const r of openSourceRepos) {
      expect(r.owner).toMatch(/^[\w.-]+$/)
      expect(r.name).toMatch(/^[\w.-]+$/)
    }
  })
})
