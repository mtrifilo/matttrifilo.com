import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { SUITE_NOTES } from './suite-notes'
import { readEvalRuns } from '@/lib/evals/results'

/**
 * The published conventions require a sentence per suite saying what it
 * measures. The page can only write one for a suite it knows, so a suite
 * added or renamed in the repository has to be added here in the same
 * change; this is what says so.
 */

const suitesDir = path.join(process.cwd(), 'evals', 'suites')

const suitesInRepository = () =>
  fs
    .readdirSync(suitesDir)
    .filter(name => name.endsWith('.yaml'))
    .map(name => path.basename(name, '.yaml'))
    .sort()

describe('the per-suite sentences', () => {
  test('are exactly the suites in the repository', () => {
    // Exactly, not merely all of them: a suite that no longer exists leaves
    // a sentence describing nothing, and the page's own paragraph describes
    // the same set one file away.
    const suites = suitesInRepository()
    expect(suites.length).toBeGreaterThan(0)
    expect(Object.keys(SUITE_NOTES).sort()).toEqual(suites)
  })

  test('cover every suite in every published record', () => {
    // A renamed suite keeps its old name in the records already published,
    // and those rows still need their sentence. No record is a valid state:
    // the page then says there is no published run.
    for (const record of readEvalRuns())
      for (const suite of record.suites)
        expect(SUITE_NOTES[suite.name]).toBeString()
  })

  test('say something, rather than naming the suite again', () => {
    for (const [name, sentence] of Object.entries(SUITE_NOTES)) {
      expect(sentence.length).toBeGreaterThan(name.length + 40)
      expect(sentence.endsWith('.')).toBe(true)
    }
  })
})
