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
  test('cover every suite in the repository', () => {
    const suites = suitesInRepository()
    expect(suites.length).toBeGreaterThan(0)
    for (const suite of suites) expect(SUITE_NOTES[suite]).toBeString()
  })

  test('cover every suite in every published record', () => {
    // A renamed suite keeps its old name in the records already published,
    // and those rows still need their sentence. No record at all is a valid
    // state: the page then says there is no published run.
    for (const record of readEvalRuns())
      for (const suite of record.suites)
        expect(SUITE_NOTES[suite.name]).toBeString()
  })

  test('describe nothing that is neither a suite nor a published one', () => {
    // The other direction, so a deleted suite does not leave a sentence
    // about something the reader can no longer find. A renamed suite keeps
    // its sentence for as long as a record still names it.
    const known = new Set([
      ...suitesInRepository(),
      ...readEvalRuns().flatMap(record =>
        record.suites.map(suite => suite.name)
      ),
    ])
    for (const name of Object.keys(SUITE_NOTES))
      expect(known.has(name)).toBe(true)
  })

  test('say something, rather than naming the suite again', () => {
    for (const [name, sentence] of Object.entries(SUITE_NOTES)) {
      expect(sentence.length).toBeGreaterThan(name.length + 40)
      expect(sentence.endsWith('.')).toBe(true)
    }
  })
})
