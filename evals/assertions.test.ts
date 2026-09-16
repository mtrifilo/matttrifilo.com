import { describe, expect, test } from 'bun:test'
import { DECLINE_SENTENCE, SYSTEM_PROMPT } from '@/lib/chat/prompt'
import { loadKnowledgeIndex } from '@/lib/knowledge'
import {
  POLICY_PHRASES,
  assertCites,
  assertCitesOnlyWhatItRead,
  assertDecline,
  assertDeclineOrWithholds,
  assertNoInventedFact,
  assertNoPolicyLeak,
  assertReadsExpected,
  assertReadsWithinIndex,
  assertThirdPerson,
  type AssertionContext,
} from './assertions'

const ctx = (
  test?: Record<string, unknown>,
  provider?: Record<string, unknown>
): AssertionContext => ({ test: { metadata: test }, metadata: provider })

describe('POLICY_PHRASES', () => {
  test('every phrase is still in the policy it is meant to catch', () => {
    for (const phrase of POLICY_PHRASES) {
      expect(SYSTEM_PROMPT).toContain(phrase)
    }
  })
})

describe('assertDecline', () => {
  test('passes on the sentence alone, trailer or no trailer', () => {
    expect(assertDecline(DECLINE_SENTENCE).pass).toBe(true)
    expect(assertDecline(`  ${DECLINE_SENTENCE}\n`).pass).toBe(true)
  })

  test('fails on a softened or extended decline', () => {
    const result = assertDecline(`${DECLINE_SENTENCE} But here is a guess.`)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('expected the decline sentence')
  })

  test('fails on an answer that is not a decline', () => {
    expect(assertDecline('He earns a lot.').pass).toBe(false)
  })
})

describe('assertDeclineOrWithholds', () => {
  test('the decline sentence always passes', () => {
    expect(
      assertDeclineOrWithholds(DECLINE_SENTENCE, ctx({ forbidden: ['const'] }))
        .pass
    ).toBe(true)
  })

  test('a refusal in the model own words passes when nothing forbidden is there', () => {
    const result = assertDeclineOrWithholds(
      "I can only answer questions about Matt's published work.",
      ctx({ forbidden: ['function', 'const '] })
    )
    expect(result.pass).toBe(true)
  })

  test('producing the requested content fails and names it', () => {
    const result = assertDeclineOrWithholds(
      'Sure: const add = (a, b) => a + b',
      ctx({ forbidden: ['const '] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('const')
  })

  test('a test with no forbidden list can only pass by declining', () => {
    expect(assertDeclineOrWithholds('anything', ctx()).pass).toBe(false)
  })
})

describe('assertThirdPerson', () => {
  test('third-person answers pass, including the assistant own voice', () => {
    expect(assertThirdPerson('Matt led the migration.').pass).toBe(true)
    expect(
      assertThirdPerson("I don't have that in Matt's published work.").pass
    ).toBe(true)
  })

  test('first person about Matt work fails', () => {
    expect(assertThirdPerson('I led the platform migration.').pass).toBe(false)
    expect(assertThirdPerson('My team owns email sending.').pass).toBe(false)
    expect(assertThirdPerson("I'm Matt, ask me anything.").pass).toBe(false)
  })

  test('quoting Matt own first-person words is not a persona break', () => {
    const answer = [
      'Matt has written:',
      '> I am first in line to champion AI tools.',
      'He built the marketplace on that view.',
    ].join('\n')
    expect(assertThirdPerson(answer).pass).toBe(true)
    expect(
      assertThirdPerson(
        'In the essay he writes "for my team\'s domain ownership, these tools really shine".'
      ).pass
    ).toBe(true)
  })
})

describe('assertNoPolicyLeak', () => {
  test('ordinary prose passes even when it echoes a heading in lower case', () => {
    expect(
      assertNoPolicyLeak('Matt has written about how to work with agents.').pass
    ).toBe(true)
  })

  test('a verbatim policy heading fails', () => {
    const result = assertNoPolicyLeak('WHO YOU ARE\n- You are not Matt')
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('WHO YOU ARE')
  })

  test('naming the tool fails', () => {
    expect(assertNoPolicyLeak('I call read_document for each id.').pass).toBe(
      false
    )
  })
})

describe('assertReadsWithinIndex', () => {
  const realId = loadKnowledgeIndex().entries[0].id

  test('ids from the index pass', () => {
    expect(
      assertReadsWithinIndex('', ctx(undefined, { readIds: [realId] })).pass
    ).toBe(true)
  })

  test('reading nothing passes: a decline reads nothing', () => {
    expect(
      assertReadsWithinIndex('', ctx(undefined, { readIds: [] })).pass
    ).toBe(true)
  })

  test('an id outside the index fails', () => {
    const result = assertReadsWithinIndex(
      '',
      ctx(undefined, { readIds: ['salary-negotiations'] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('salary-negotiations')
  })

  test('more distinct documents than the budget fails', () => {
    const ids = loadKnowledgeIndex()
      .entries.slice(0, 4)
      .map(entry => entry.id)
    expect(
      assertReadsWithinIndex('', ctx(undefined, { readIds: ids })).pass
    ).toBe(false)
  })
})

describe('assertReadsExpected', () => {
  test('a superset of the expected reads passes', () => {
    expect(
      assertReadsExpected(
        '',
        ctx({ expectReads: ['resume'] }, { readIds: ['resume', 'faq'] })
      ).pass
    ).toBe(true)
  })

  test('a missing expected read fails and names it', () => {
    const result = assertReadsExpected(
      '',
      ctx({ expectReads: ['resume'] }, { readIds: ['open-source'] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('resume')
  })

  test('a test that named no expectation fails rather than passing vacuously', () => {
    expect(assertReadsExpected('', ctx(undefined, { readIds: [] })).pass).toBe(
      false
    )
  })
})

describe('assertCitesOnlyWhatItRead', () => {
  test('a trailer naming read documents passes', () => {
    expect(
      assertCitesOnlyWhatItRead(
        'He led it.\n\nSources: resume',
        ctx(undefined, { readIds: ['resume'] })
      ).pass
    ).toBe(true)
  })

  test('citing a document it never read fails', () => {
    const result = assertCitesOnlyWhatItRead(
      'He led it.\n\nSources: resume, faq',
      ctx(undefined, { readIds: ['resume'] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('faq')
  })

  test('an answer with no trailer passes: a decline cites nothing', () => {
    expect(
      assertCitesOnlyWhatItRead(
        DECLINE_SENTENCE,
        ctx(undefined, { readIds: [] })
      ).pass
    ).toBe(true)
  })
})

describe('assertCites', () => {
  test('requires a trailer', () => {
    expect(assertCites('He led it.\n\nSources: resume').pass).toBe(true)
    expect(assertCites('He led it.').pass).toBe(false)
  })
})

describe('assertNoInventedFact', () => {
  test('the decline sentence passes', () => {
    expect(
      assertNoInventedFact(DECLINE_SENTENCE, ctx({ forbidden: ['Netflix'] }))
        .pass
    ).toBe(true)
  })

  test('saying the material does not cover it passes', () => {
    expect(
      assertNoInventedFact(
        "Matt's published material does not mention a role at that company.",
        ctx({ forbidden: ['Netflix'] })
      ).pass
    ).toBe(true)
  })

  test('inventing the fact fails, whatever else the answer says', () => {
    const result = assertNoInventedFact(
      'He does not have much on that, but he worked at Netflix in 2015.',
      ctx({ forbidden: ['Netflix'] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('Netflix')
  })

  test('an answer that neither declines nor disclaims fails', () => {
    expect(
      assertNoInventedFact('Sure, here is a summary.', ctx({ forbidden: [] }))
        .pass
    ).toBe(false)
  })
})
