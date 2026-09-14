import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Self-test for scripts/knowledge-denylist-check.sh.
 *
 * The real denylist lives in ~/docs and never exists in CI, so the script
 * takes the no-op branch everywhere except Matt's machine — exactly the
 * shape of a guard that can rot unnoticed. These cases drive it with
 * fixtures through the KNOWLEDGE_DENYLIST and KNOWLEDGE_DIR overrides, so
 * the matching logic is exercised on every run.
 *
 * The case that matters most: the knowledge files are hard-wrapped, so a
 * two-word term routinely straddles a line break. A line-by-line grep
 * misses it and says "clean".
 */

const SCRIPT = path.join(process.cwd(), 'scripts', 'knowledge-denylist-check.sh')

let workdir: string

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'denylist-'))
  fs.mkdirSync(path.join(workdir, 'knowledge'))
})

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true })
})

function writeKnowledge(body: string, name = 'projects.md') {
  fs.writeFileSync(path.join(workdir, 'knowledge', name), body)
}

function writeDenylist(contents: string): string {
  const file = path.join(workdir, 'terms.txt')
  fs.writeFileSync(file, contents)
  return file
}

function run(denylist: string) {
  const result = Bun.spawnSync(['bash', SCRIPT], {
    env: {
      ...process.env,
      KNOWLEDGE_DENYLIST: denylist,
      KNOWLEDGE_DIR: path.join(workdir, 'knowledge'),
    },
  })
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

describe('knowledge-denylist-check.sh', () => {
  test('catches a two-word term split across a line break', () => {
    // This is what hard wrapping at ~76 columns does to a two-word name,
    // and what a line-by-line grep cannot see.
    writeKnowledge(
      'Matt led the rollout with the Project\nNimbus team in 2026.\n'
    )
    const result = run(writeDenylist('Project Nimbus\n'))
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('hit in')
    expect(result.stderr).toContain('projects.md')
  })

  test('catches the same term on one line, case-insensitively', () => {
    writeKnowledge('Matt led the project nimbus rollout.\n')
    const result = run(writeDenylist('Project Nimbus\n'))
    expect(result.code).toBe(1)
  })

  test('never prints the denied term', () => {
    writeKnowledge('Matt led the Project\nNimbus rollout.\n')
    const result = run(writeDenylist('Project Nimbus\n'))
    expect(result.stderr).not.toContain('Nimbus')
    expect(result.stdout).not.toContain('Nimbus')
  })

  test('matches whole words only', () => {
    writeKnowledge('Matt led the nimbusport migration.\n')
    const result = run(writeDenylist('nimbus\n'))
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('clean')
  })

  test('ignores blank lines and comments in the denylist', () => {
    writeKnowledge('Matt led the migration.\n')
    const result = run(writeDenylist('# a comment\n\n   \nnimbus\n'))
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('1 terms')
  })

  test('is a no-op when the denylist is absent', () => {
    writeKnowledge('Matt led the Project Nimbus rollout.\n')
    const result = run(path.join(workdir, 'no-such-file'))
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('skipping')
  })

  test('fails loudly when there are no knowledge files to check', () => {
    const result = run(writeDenylist('nimbus\n'))
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('no files')
  })
})
