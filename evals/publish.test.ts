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
  suites: [{ name: 'golden', passed: 40, total: 40 }],
  totals: { passed: 40, total: 40 },
  retried: 0,
  transportFailures: 0,
  missingTrailer: 0,
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
        suites: [{ name: 'golden', passed: 40, total: 40 }],
        totals: { passed: 40, total: 40 },
        retried: 0,
        transportFailures: 0,
        missingTrailer: 0,
      },
    })
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
      planPublish(summary({ totals: { passed: 40, total: 90 } }), HEAD_SHA)
    ).toEqual({ refusal: expect.stringContaining('do not add up') })
  })

  // The floor itself is covered in lib/evals/results.test.ts, where it
  // lives; these pin that the gate applies it and says which number failed.
  test('refuses a run that produced an ungradeable row', () => {
    expect(planPublish(summary({ transportFailures: 1 }), HEAD_SHA)).toEqual({
      refusal: expect.stringContaining('no answer to grade'),
    })
  })

  test('refuses a run that did not pass enough tests', () => {
    expect(
      planPublish(
        summary({
          suites: [{ name: 'golden', passed: 37, total: 40 }],
          totals: { passed: 37, total: 40 },
        }),
        HEAD_SHA
      )
    ).toEqual({ refusal: expect.stringContaining('95 percent') })
  })

  test('refuses a run with one weak suite', () => {
    expect(
      planPublish(
        summary({
          suites: [
            { name: 'golden', passed: 40, total: 40 },
            { name: 'groundedness', passed: 8, total: 10 },
          ],
          totals: { passed: 48, total: 50 },
        }),
        HEAD_SHA
      )
    ).toEqual({ refusal: expect.stringContaining('`groundedness`') })
  })

  test('refuses a run that was retried past its flake budget', () => {
    expect(planPublish(summary({ retried: 5 }), HEAD_SHA)).toEqual({
      refusal: expect.stringContaining('sent again'),
    })
  })

  test('refuses a run whose answers kept dropping the trailer', () => {
    expect(planPublish(summary({ missingTrailer: 5 }), HEAD_SHA)).toEqual({
      refusal: expect.stringContaining('Sources: trailer'),
    })
  })

  test('refuses a run that names no promptfoo version', () => {
    // It used to publish with a warning. The record is the claim that the
    // suites ran; without the version it does not say what ran them.
    const older = summary() as unknown as Record<string, unknown>
    delete older.promptfooVersion
    expect(planPublish(older, HEAD_SHA)).toEqual({
      refusal: expect.stringContaining('promptfooVersion'),
    })
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

  const tempDir = (prefix: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }

  const run = (dir: string, args: string[]) =>
    Bun.spawnSync({
      cmd: ['git', ...args],
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

  /**
   * A clean checkout to publish from. The script consults git for the state
   * of the working copy and refuses when it cannot be read, so a test that
   * publishes has to run somewhere git answers.
   */
  const checkout = () => {
    const dir = tempDir('publish-')
    run(dir, ['init', '--quiet'])
    run(dir, ['config', 'user.email', 'test@example.invalid'])
    run(dir, ['config', 'user.name', 'Publish Test'])
    run(dir, ['commit', '--quiet', '--allow-empty', '-m', 'base'])
    return dir
  }

  /** The summary to publish, kept outside the checkout so it stays clean. */
  const summaryFile = (contents: unknown) => {
    const file = path.join(tempDir('summary-'), 'summary.json')
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

  const published = (dir: string) =>
    path.join(dir, 'evals', 'results', '2026-09-21-6406ee4.json')

  test('refuses when there is no summary to publish', () => {
    const dir = checkout()
    const result = publish(dir, path.join(dir, 'missing.json'))
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('no summary at')
  })

  test('refuses a summary that is not JSON', () => {
    const result = publish(checkout(), summaryFile('{ not json'))
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('does not parse as JSON')
  })

  test('refuses a summary that names no promptfoo version', () => {
    const older = summary() as unknown as Record<string, unknown>
    delete older.promptfooVersion
    const result = publish(checkout(), summaryFile(older))
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('promptfooVersion')
  })

  test('refuses a run that cannot stand as a record, and says why', () => {
    const dir = checkout()
    const result = publish(dir, summaryFile(summary({ transportFailures: 2 })))
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('no answer to grade')
    expect(fs.existsSync(path.join(dir, 'evals', 'results'))).toBe(false)
  })

  test('a refusal says what to do next', () => {
    const result = publish(
      checkout(),
      summaryFile(summary({ transportFailures: 2 }))
    )
    expect(result.stderr.toString()).toContain('results.json')
    expect(result.stderr.toString()).toContain(
      'docs/career-assistant-operations.md'
    )
  })

  test('refuses to publish from a dirty working copy', () => {
    // The record claims a commit contains the suites and the corpus the run
    // walked. With a change still uncommitted, no commit does.
    const dir = checkout()
    fs.writeFileSync(path.join(dir, 'uncommitted.txt'), 'work in progress')
    const result = publish(dir, summaryFile(summary()))
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('uncommitted changes')
    expect(fs.existsSync(path.join(dir, 'evals', 'results'))).toBe(false)
  })

  test('refuses where git cannot say whether the tree is clean', () => {
    // Fails closed on purpose: otherwise pointing GIT_DIR at nothing would
    // lift the refusal above from outside the script.
    const dir = tempDir('not-a-repository-')
    const result = publish(dir, summaryFile(summary()))
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('could not say')
    expect(fs.existsSync(path.join(dir, 'evals', 'results'))).toBe(false)
  })

  test('writes the record, then refuses to replace it', () => {
    // The safety property the runbook advertises: a record that exists is
    // never rewritten, whatever is published at it.
    const dir = checkout()
    const file = summaryFile(summary())
    expect(publish(dir, file).exitCode).toBe(0)
    expect(JSON.parse(fs.readFileSync(published(dir), 'utf8'))).toEqual(
      summary()
    )

    // The runbook's next step, and what makes the tree clean again.
    run(dir, ['add', 'evals'])
    run(dir, ['commit', '--quiet', '-m', 'the record'])

    const again = publish(dir, file)
    expect(again.exitCode).toBe(1)
    expect(again.stderr.toString()).toContain('already exists')
    expect(JSON.parse(fs.readFileSync(published(dir), 'utf8'))).toEqual(
      summary()
    )
  })
})
