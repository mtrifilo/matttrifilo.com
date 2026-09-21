import { describe, expect, test } from 'bun:test'
import { openSourceRepos } from '@/content/open-source'
import { ASSISTANT_REPOSITORIES, assistantRepository } from './repositories'

/**
 * The allowlist is the whole boundary of what the assistant may fetch
 * (MTC-45), so these are the tests that would fail if a repository quietly
 * joined it or left it.
 */

describe('the assistant allowlist', () => {
  test('is exactly the repositories Matt approved', () => {
    // Matt's decision 1 on MTC-45, written where a change to it has to be
    // deliberate. Adding a repository means editing this list and this test.
    expect(ASSISTANT_REPOSITORIES.map(repo => repo.slug)).toEqual([
      'mtrifilo/decant',
      'mtrifilo/psychic-homily-web',
      'mtrifilo/matttrifilo.com',
    ])
  })

  test('is derived from the flag, not from the curated list', () => {
    const flagged = openSourceRepos.filter(repo => repo.assistant === true)
    expect(ASSISTANT_REPOSITORIES).toHaveLength(flagged.length)
  })

  test('every entry describes itself in Matt reviewed words', () => {
    for (const repo of ASSISTANT_REPOSITORIES) {
      const curated = openSourceRepos.find(entry => entry.name === repo.name)
      expect(repo.description).toBe(String(curated?.summary?.trim()))
      expect(repo.description.length).toBeGreaterThan(0)
    }
  })

  test('a flagged entry with no reviewed summary is left off', () => {
    // The model is shown the description in the prompt, so an entry without
    // one would either show a blank line or fall back to GitHub's text. It is
    // dropped instead, which fails the first test loudly.
    for (const repo of openSourceRepos) {
      if (repo.assistant !== true) continue
      expect(repo.summary?.trim()).toBeTruthy()
    }
  })

  test('ids are distinct, so one id can only mean one repository', () => {
    const ids = ASSISTANT_REPOSITORIES.map(repo => repo.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('an id is the repository name and never a path', () => {
    for (const repo of ASSISTANT_REPOSITORIES) {
      expect(repo.id).toBe(repo.name)
      expect(repo.id).not.toContain('/')
      expect(repo.slug).toBe(`${repo.owner}/${repo.name}`)
    }
  })
})

describe('assistantRepository', () => {
  test('resolves an allowlisted id', () => {
    expect(assistantRepository('decant')?.slug).toBe('mtrifilo/decant')
  })

  test.each([
    'mtrifilo/decant',
    'Decant',
    'decant ',
    '',
    '__proto__',
    'toString',
  ])('does not resolve %p', id => {
    expect(assistantRepository(id)).toBeUndefined()
  })
})
