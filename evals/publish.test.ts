import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { planPublish, publishedCommit, resultFileName } from './publish'
import type { EvalSummary } from './summary'

/**
 * What `evals:publish` decides before anything is committed: which commit
 * the record names, what it is called, and what it refuses. The record it
 * writes is committed to a public repository, so what goes into it is
 * pinned here rather than left to a spread.
 */

const CI_SHA = '6406ee4d4afe1da0290d23a1f0afa3bf6e225902'
const HEAD_SHA = '1f2e3d4c5b6a7980112233445566778899aabbcc'

const summary = (over: Partial<EvalSummary> = {}): EvalSummary => ({
  commit: CI_SHA,
  ranAt: '2026-09-21T16:59:31.433Z',
  model: 'gemini-3.8-flash',
  promptfooVersion: '0.123.0',
  suites: [{ name: 'golden', passed: 3, total: 4 }],
  totals: { passed: 3, total: 4 },
  retried: 0,
  ...over,
})

describe('publishedCommit', () => {
  test('keeps the commit the run recorded', () => {
    expect(publishedCommit(CI_SHA, HEAD_SHA)).toBe(CI_SHA)
  })

  test('stands HEAD in when the run recorded no commit', () => {
    // A local run has no GITHUB_SHA and records `local`; HEAD is the commit
    // the record is about to be attached to.
    expect(publishedCommit('local', HEAD_SHA)).toBe(HEAD_SHA)
  })

  test('names no commit when neither is a git object name', () => {
    expect(publishedCommit('local', null)).toBe(null)
    expect(publishedCommit('local', 'not-a-sha')).toBe(null)
  })
})

describe('resultFileName', () => {
  test('is the run date in UTC and the seven-character commit', () => {
    expect(resultFileName('2026-09-21T16:59:31.433Z', CI_SHA)).toBe(
      '2026-09-21-6406ee4.json'
    )
  })

  test('dates the file by when the run happened, not by when it is published', () => {
    expect(resultFileName('2026-08-01T23:59:59.000Z', HEAD_SHA)).toBe(
      '2026-08-01-1f2e3d4.json'
    )
  })
})

describe('planPublish', () => {
  test('publishes the fields the page shows, and only those', () => {
    const decision = planPublish(
      { ...summary(), rationale: 'a grader explaining itself' },
      null
    )
    expect(decision).toEqual({
      file: '2026-09-21-6406ee4.json',
      record: {
        commit: CI_SHA,
        ranAt: '2026-09-21T16:59:31.433Z',
        model: 'gemini-3.8-flash',
        promptfooVersion: '0.123.0',
        suites: [{ name: 'golden', passed: 3, total: 4 }],
        totals: { passed: 3, total: 4 },
        retried: 0,
      },
    })
  })

  test('leaves out a promptfoo version the run did not record', () => {
    const older = summary()
    delete older.promptfooVersion
    const decision = planPublish(older, null)
    expect(decision).not.toHaveProperty('refusal')
    expect(
      Object.keys('record' in decision ? decision.record : {})
    ).not.toContain('promptfooVersion')
  })

  test('refuses a summary with no totals, and says which field', () => {
    const broken = summary() as unknown as Record<string, unknown>
    delete broken.totals
    expect(planPublish(broken, HEAD_SHA)).toEqual({
      refusal: expect.stringContaining('`totals`'),
    })
  })

  test('refuses a summary whose suites disagree with its totals', () => {
    expect(
      planPublish(summary({ totals: { passed: 3, total: 9 } }), HEAD_SHA)
    ).toEqual({ refusal: expect.stringContaining('do not add up') })
  })

  test('refuses when no commit can be named', () => {
    expect(planPublish(summary({ commit: 'local' }), null)).toEqual({
      refusal: expect.stringContaining('name no commit'),
    })
  })

  test('names HEAD when the run recorded no commit of its own', () => {
    const decision = planPublish(summary({ commit: 'local' }), HEAD_SHA)
    expect(decision).toMatchObject({
      file: '2026-09-21-1f2e3d4.json',
      record: { commit: HEAD_SHA },
    })
  })
})

describe('the script itself', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true })
  })

  const workspace = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-'))
    dirs.push(dir)
    return dir
  }

  const writeSummary = (dir: string, contents: unknown) => {
    const file = path.join(dir, 'summary.json')
    fs.writeFileSync(
      file,
      typeof contents === 'string' ? contents : JSON.stringify(contents)
    )
    return file
  }

  // Run in a temporary working directory: the script writes relative to the
  // directory it is run from, and a test must never touch the published one.
  const publish = (dir: string, summaryPath: string) =>
    Bun.spawnSync({
      cmd: [
        'bun',
        'run',
        path.join(process.cwd(), 'evals', 'publish.ts'),
        summaryPath,
      ],
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

  test('refuses when there is no summary to publish', () => {
    const dir = workspace()
    const result = publish(dir, path.join(dir, 'missing.json'))
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('no summary at')
  })

  test('refuses a summary that is not JSON', () => {
    const dir = workspace()
    const result = publish(dir, writeSummary(dir, '{ not json'))
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('does not parse as JSON')
  })

  test('says so when the record it writes names no promptfoo version', () => {
    // The conventions ask every published summary to name one. It still
    // publishes, but nobody should find the gap out from the page.
    const dir = workspace()
    const older = summary()
    delete older.promptfooVersion
    const result = publish(dir, writeSummary(dir, older))
    expect(result.exitCode).toBe(0)
    expect(result.stderr.toString()).toContain('no promptfoo version')
  })

  test('writes the record, then refuses to replace it', () => {
    // The safety property the runbook advertises: a record that exists is
    // never rewritten, whatever is published at it.
    const dir = workspace()
    const file = writeSummary(dir, summary())
    expect(publish(dir, file).exitCode).toBe(0)
    const written = path.join(
      dir,
      'evals',
      'results',
      '2026-09-21-6406ee4.json'
    )
    expect(JSON.parse(fs.readFileSync(written, 'utf8'))).toEqual(summary())

    const again = publish(dir, file)
    expect(again.exitCode).toBe(1)
    expect(again.stderr.toString()).toContain('already exists')
    expect(JSON.parse(fs.readFileSync(written, 'utf8'))).toEqual(summary())
  })
})
