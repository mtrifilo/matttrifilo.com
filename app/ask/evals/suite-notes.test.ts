import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { SUITE_NOTES } from './page'
import { readEvalRuns } from '@/lib/evals/results'

/**
 * The published conventions require a sentence per suite saying what it
 * measures. The page can only write one for a suite it knows, so a suite
 * added or renamed in the repository has to be added here in the same
 * change; this is what says so.
 */

const suitesDir = path.join(process.cwd(), 'evals', 'suites')

describe('the per-suite sentences', () => {
  test('cover every suite in the repository', () => {
    const suites = fs
      .readdirSync(suitesDir)
      .filter(name => name.endsWith('.yaml'))
      .map(name => path.basename(name, '.yaml'))
    expect(suites.length).toBeGreaterThan(0)
    for (const suite of suites) expect(SUITE_NOTES[suite]).toBeString()
  })

  test('cover every suite in the newest published record', () => {
    // A renamed suite keeps its old name in the records already published,
    // and those rows still need their sentence.
    const [latest] = readEvalRuns()
    expect(latest).toBeDefined()
    for (const suite of latest.suites)
      expect(SUITE_NOTES[suite.name]).toBeString()
  })

  test('say something, rather than naming the suite again', () => {
    for (const [name, sentence] of Object.entries(SUITE_NOTES)) {
      expect(sentence.length).toBeGreaterThan(name.length + 40)
      expect(sentence.endsWith('.')).toBe(true)
    }
  })
})
