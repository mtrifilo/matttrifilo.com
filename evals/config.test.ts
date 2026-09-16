import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_GEMINI_MODEL } from '@/lib/ai/vertex'
import { loadKnowledgeIndex } from '@/lib/knowledge'
import * as assertions from './assertions'
import { historyFrom } from './route-request'

/**
 * Guards on the suite files themselves (MTC-32).
 *
 * The suites are YAML, so nothing in them is type-checked: a typo in an
 * assertion name, a missing `metadata.suite`, or a test that asserts nothing
 * would all pass silently and quietly shrink the gate. These checks run in
 * `bun test` on every change, cost nothing, and need no credentials.
 */

const EVALS = import.meta.dir
const SUITES = ['golden', 'refusals', 'injection', 'groundedness'] as const
type SuiteName = (typeof SUITES)[number]

/** The floor the ticket sets for each suite. */
const MINIMUM: Record<SuiteName, number> = {
  golden: 30,
  refusals: 20,
  injection: 20,
  groundedness: 20,
}

/** Tests each suite marks for `bun run evals:smoke`. */
const SMOKE_PER_SUITE = 3

interface SuiteAssertion {
  type?: unknown
  value?: unknown
  assert?: SuiteAssertion[]
}

interface SuiteTest {
  description?: unknown
  vars?: { question?: unknown; history?: unknown }
  metadata?: Record<string, unknown>
  assert?: SuiteAssertion[]
}

function readYaml<T>(relativePath: string): T {
  return Bun.YAML.parse(
    readFileSync(join(EVALS, relativePath), 'utf8')
  ) as unknown as T
}

const config = readYaml<{
  providers: { id: string; label?: string }[]
  prompts: string[]
  defaultTest: { options: { provider: { id: string } } }
  tests: string[]
}>('promptfooconfig.yaml')

const suites: Record<SuiteName, SuiteTest[]> = {
  golden: readYaml<SuiteTest[]>('suites/golden.yaml'),
  refusals: readYaml<SuiteTest[]>('suites/refusals.yaml'),
  injection: readYaml<SuiteTest[]>('suites/injection.yaml'),
  groundedness: readYaml<SuiteTest[]>('suites/groundedness.yaml'),
}

/** Every `file://assertions.ts:name` a set of tests references, nesting included. */
function assertionNames(tests: SuiteTest[]): string[] {
  const names: string[] = []
  const walk = (list: SuiteAssertion[] | undefined) => {
    for (const entry of list ?? []) {
      if (typeof entry.value === 'string') {
        const match = /^file:\/\/assertions\.ts:(.+)$/.exec(entry.value)
        if (match) names.push(match[1])
      }
      walk(entry.assert)
    }
  }
  for (const item of tests) walk(item.assert)
  return names
}

/** Every assertion `type` a set of tests uses, nesting included. */
function assertionTypes(tests: SuiteTest[]): string[] {
  const types: string[] = []
  const walk = (list: SuiteAssertion[] | undefined) => {
    for (const entry of list ?? []) {
      if (typeof entry.type === 'string') types.push(entry.type)
      walk(entry.assert)
    }
  }
  for (const item of tests) walk(item.assert)
  return types
}

/**
 * Assertions that check for the absence of something, and therefore pass on
 * an empty answer.
 */
const ABSENCE_ONLY: ReadonlySet<string> = new Set([
  'assertThirdPerson',
  'assertNoPolicyLeak',
  'assertReadsWithinIndex',
  'assertDeclineOrWithholds',
  'assertCitesOnlyWhatItRead',
  'assertChipsMatchReads',
])

function toArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

describe('promptfooconfig.yaml', () => {
  test('targets the route provider and nothing else', () => {
    expect(config.providers).toHaveLength(1)
    expect(config.providers[0].id).toBe('file://provider.ts')
  })

  test('the rubric grader tracks the model the route defaults to', () => {
    expect(config.defaultTest.options.provider.id).toBe(
      `vertex:${DEFAULT_GEMINI_MODEL}`
    )
  })

  test('every assert-set threshold is one two of three grades can clear', () => {
    // An assert-set scores on the weighted MEAN of its members, so 0.67 would
    // reject 2/3 = 0.666... and demand three of three. Pinned here because the
    // YAML is the only place the number lives.
    const thresholds = SUITES.flatMap(name =>
      readFileSync(join(EVALS, `suites/${name}.yaml`), 'utf8')
        .split('\n')
        .filter(line => line.includes('threshold:'))
        .map(line => Number(line.split('threshold:')[1].trim()))
    )
    expect(thresholds.length).toBeGreaterThan(0)
    for (const threshold of thresholds) {
      expect(threshold).toBeLessThan(2 / 3)
      expect(threshold).toBeGreaterThan(1 / 3)
    }
  })

  test('lists every suite file, and only those', () => {
    expect(config.tests).toEqual(
      SUITES.map(name => `file://suites/${name}.yaml`)
    )
  })
})

for (const name of SUITES) {
  const suite = suites[name]

  describe(`suites/${name}.yaml`, () => {
    test('has at least the number of tests the ticket asks for', () => {
      expect(suite.length).toBeGreaterThanOrEqual(MINIMUM[name])
    })

    test('every test has a description, a question, and an assertion', () => {
      for (const item of suite) {
        expect(typeof item.description).toBe('string')
        expect(typeof item.vars?.question).toBe('string')
        expect(item.assert?.length ?? 0).toBeGreaterThan(0)
      }
    })

    test('every test is labelled with its own suite', () => {
      for (const item of suite) expect(item.metadata?.suite).toBe(name)
    })

    test('descriptions are unique, so a red row names one test', () => {
      const descriptions = suite.map(item => String(item.description))
      expect(new Set(descriptions).size).toBe(descriptions.length)
    })

    test('the smoke subset is the first three tests', () => {
      const marked = suite
        .map((item, index) => (item.metadata?.smoke === true ? index : -1))
        .filter(index => index >= 0)
      expect(marked).toEqual(
        Array.from({ length: SMOKE_PER_SUITE }, (_, index) => index)
      )
    })

    test('every assertion it names is exported by assertions.ts', () => {
      const exported = assertions as unknown as Record<string, unknown>
      for (const assertion of assertionNames(suite)) {
        expect(typeof exported[assertion]).toBe('function')
      }
    })

    test('assertions that read test metadata are given it', () => {
      for (const item of suite) {
        const names = assertionNames([item])
        const metadata = item.metadata ?? {}
        if (names.includes('assertReadsExpected')) {
          expect(Array.isArray(metadata.expectReads)).toBe(true)
        }
        if (names.includes('assertReadsAnyOf')) {
          expect(Array.isArray(metadata.expectReadsAny)).toBe(true)
        }
        if (
          names.includes('assertDeclineOrWithholds') ||
          names.includes('assertNoInventedFact')
        ) {
          expect(Array.isArray(metadata.forbidden)).toBe(true)
        }
      }
    })

    test('every expected read names a document in the corpus', () => {
      const known = new Set(loadKnowledgeIndex().entries.map(entry => entry.id))
      for (const item of suite) {
        const ids = [
          ...toArray(item.metadata?.expectReads),
          ...toArray(item.metadata?.expectReadsAny),
        ]
        for (const id of ids) expect([...known]).toContain(id)
      }
    })

    test('a test built only from absence checks also asserts it answered', () => {
      for (const item of suite) {
        const names = assertionNames([item])
        const types = assertionTypes([item])
        const onlyAbsence =
          names.length > 0 &&
          names.every(name => ABSENCE_ONLY.has(name)) &&
          types.every(type => type === 'javascript')
        if (onlyAbsence) {
          // Every one of those passes on an empty string, so together they
          // would go green against an assistant that said nothing at all.
          expect(names).toContain('assertAnswered')
        }
      }
    })

    test('every replayed turn is one the provider will actually send', () => {
      for (const item of suite) {
        const history = item.vars?.history
        if (history === undefined) continue
        expect(Array.isArray(history)).toBe(true)
        // historyFrom drops anything malformed, so a typo here would quietly
        // turn a multi-turn escalation into a single-turn test that still
        // passes. The parsed turns have to match what was written.
        const written = history as unknown[]
        expect(historyFrom({ history: written })).toHaveLength(written.length)
      }
    })

    test('no question smuggles template syntax into the rendered prompt', () => {
      for (const item of suite) {
        const question = String(item.vars?.question)
        expect(question).not.toContain('{{')
        expect(question).not.toContain('{%')
      }
    })
  })
}
