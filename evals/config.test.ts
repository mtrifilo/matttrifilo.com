import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STARTER_QUESTIONS } from '@/components/assistant/copy'
import { DEFAULT_GEMINI_MODEL } from '@/lib/ai/vertex'
import { ASSISTANT_REPOSITORIES } from '@/lib/chat/repositories'
import { listKnowledgeDocuments, loadKnowledgeIndex } from '@/lib/knowledge'
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

/**
 * The floor each suite has to stay above.
 *
 * It is a floor, not a count: a suite may grow freely, and only a change
 * that drops one below its number has to argue for itself here. `golden`
 * sits well above the others because the correspondence test below protects
 * only the goldens that answer a starter question; without this number the
 * rest of the suite is guarded by nothing.
 */
const MINIMUM: Record<SuiteName, number> = {
  golden: 70,
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
  'assertNoNarration',
  'assertNoPolicyLeak',
  'assertReadsWithinIndex',
  'assertDeclineOrWithholds',
  'assertCitesOnlyWhatItRead',
  'assertChipsMatchReads',
  // Reads the provider's ledger, not the answer, so an empty answer clears
  // it; `assertNoHandles` is an absence check on the text for the same
  // reason. Neither can stand alone as the thing a test judges.
  'assertCheckedActivity',
  'assertNoHandles',
])

function toArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/** The distinct values that appear more than once, for a failure that names them. */
function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))]
}

/** Every `icontains`/`icontains-any` needle a test carries, nesting included. */
function containsNeedles(item: SuiteTest): string[] {
  const needles: string[] = []
  const walk = (list: SuiteAssertion[] | undefined) => {
    for (const entry of list ?? []) {
      if (entry.type === 'icontains-any' || entry.type === 'contains-any') {
        needles.push(...toArray(entry.value))
      }
      if (
        (entry.type === 'icontains' || entry.type === 'contains') &&
        typeof entry.value === 'string'
      ) {
        needles.push(entry.value)
      }
      walk(entry.assert)
    }
  }
  walk(item.assert)
  return needles
}

/**
 * The corpus bodies, whitespace-flattened and lowercased.
 *
 * Flattened because the markdown is hard-wrapped, so a phrase the assistant
 * would say on one line is split across two in the file and a raw substring
 * search would miss it.
 */
const corpusText = new Map<string, string>(
  listKnowledgeDocuments().map(document => [
    document.id,
    document.text.replace(/\s+/g, ' ').toLowerCase(),
  ])
)

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

describe('starter questions', () => {
  /**
   * The pool is the only copy a visitor is invited to click, so a pool entry
   * with no golden is a question shipped without anything measuring whether
   * it draws a sourced answer or a decline. Matching on the exact string
   * rather than the subject is the point: a golden on the same topic in
   * different words does not prove the wording in the pill works.
   */
  test('every starter question is the exact question of a golden', () => {
    const asked = new Set(
      suites.golden.map(item => String(item.vars?.question))
    )
    const missing = STARTER_QUESTIONS.filter(question => !asked.has(question))
    expect(missing).toEqual([])
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

    test('no two tests ask the same question', () => {
      // Unique descriptions do not imply unique questions, and a merge that
      // keeps both sides of two branches is how a suite acquires a duplicate:
      // it pays for a second full run of one question and shows up as two
      // rows nobody can tell apart.
      const questions = suite.map(item => String(item.vars?.question))
      expect(duplicates(questions)).toEqual([])
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
        if (names.includes('assertCheckedActivity')) {
          expect(Array.isArray(metadata.expectActivity)).toBe(true)
        }
        if (
          names.includes('assertDeclineOrWithholds') ||
          names.includes('assertNoInventedFact')
        ) {
          expect(Array.isArray(metadata.forbidden)).toBe(true)
        }
      }
    })

    test('every expected check names an allowlisted repository', () => {
      // A golden pointed at a repository the route may not fetch would fail
      // on every run for a reason that has nothing to do with the answer.
      const allowed = ASSISTANT_REPOSITORIES.map(repository => repository.id)
      for (const item of suite) {
        for (const id of toArray(item.metadata?.expectActivity)) {
          expect(allowed).toContain(id)
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
        // Anything that judges what the answer SAYS: a named assertion that is
        // not an absence check, or a promptfoo assertion that reads the output
        // (the contains family, a rubric). Any one of them already fails on an
        // empty answer, so the test does not need assertAnswered as well.
        // A `not-` assertion is an absence check like the named ones and
        // passes on an empty answer, so it does not count.
        const judgesContent =
          names.some(name => !ABSENCE_ONLY.has(name)) ||
          types.some(
            type =>
              type !== 'javascript' &&
              type !== 'assert-set' &&
              !type.startsWith('not-')
          )
        expect({
          description: item.description,
          judgesContent,
        }).toEqual({ description: item.description, judgesContent: true })
      }
    })

    test('every document a test expects can satisfy its own phrase check', () => {
      // `assertReadsAnyOf` passes on ONE of the documents a test names, so a
      // document listed there that contains none of the test's distinctive
      // phrases makes the test unpassable from that document: the run clears
      // the read gate and then fails the phrase check, which reads as a model
      // regression rather than as the suite asking for something it cannot
      // get. The same holds for an `expectReads` id.
      const unreachable: unknown[] = []
      for (const item of suite) {
        const needles = containsNeedles(item)
        if (needles.length === 0) continue
        const ids = [
          ...toArray(item.metadata?.expectReads),
          ...toArray(item.metadata?.expectReadsAny),
        ]
        for (const id of ids) {
          const text = corpusText.get(id) ?? ''
          const reachable = needles.some(needle =>
            text.includes(needle.toLowerCase())
          )
          if (!reachable)
            unreachable.push({ description: item.description, id })
        }
      }
      expect(unreachable).toEqual([])
    })

    test('no anchor name is defined twice', () => {
      // Anchors are the one place in these files where two definitions
      // resolve silently: YAML takes the nearest preceding one, so a merge
      // that keeps two `&r38` blocks grades one test against the other's
      // rubric with nothing red. Read from the raw text, because a parser
      // has already collapsed them by the time it hands back objects.
      // Matched at an anchor's only legal position, right after the `key:`
      // it labels, so an ampersand inside rubric prose ("R&D") is not read
      // as a declaration and cannot redden the suite with a false duplicate.
      const raw = readFileSync(join(EVALS, `suites/${name}.yaml`), 'utf8')
      const anchors = [...raw.matchAll(/^\s*(?:-\s*)?\w+:\s+&([\w-]+)/gm)].map(
        match => match[1]
      )
      expect(duplicates(anchors)).toEqual([])
    })

    test('every assert-set grades one rubric, repeated', () => {
      // The tolerance this pattern buys is "two of three grades of the SAME
      // rubric". Three different rubrics inside one assert-set would still
      // score on the mean, quietly turning a judgement into a checklist that
      // passes at 0.6 with one part unmet.
      const offenders: unknown[] = []
      const walk = (
        list: SuiteAssertion[] | undefined,
        description: unknown
      ) => {
        for (const entry of list ?? []) {
          if (entry.type === 'assert-set') {
            const values = (entry.assert ?? []).map(member =>
              String(member.value)
            )
            if (values.length < 2 || new Set(values).size !== 1) {
              offenders.push({ description, distinct: new Set(values).size })
            }
          }
          walk(entry.assert, description)
        }
      }
      for (const item of suite) walk(item.assert, item.description)
      expect(offenders).toEqual([])
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
