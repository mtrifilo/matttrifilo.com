import { describe, expect, test } from 'bun:test'
import { DECLINE_SENTENCE, SYSTEM_PROMPT } from '@/lib/chat/prompt'
import { loadKnowledgeIndex } from '@/lib/knowledge'
import {
  POLICY_PHRASES,
  assertAnswered,
  assertChipsMatchReads,
  assertCites,
  assertCitesOnlyWhatItRead,
  assertDecline,
  assertDeclineOrWithholds,
  assertNoInventedFact,
  assertNoPolicyLeak,
  assertReadsAnyOf,
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

  test('fails on a decline that added the Sources line the policy forbids', () => {
    expect(assertDecline(`${DECLINE_SENTENCE}\n\nSources: resume`).pass).toBe(
      false
    )
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

  test('an auxiliary, an adverb, or another work verb does not slip past', () => {
    expect(assertThirdPerson('I currently lead the email team.').pass).toBe(
      false
    )
    expect(assertThirdPerson('I have been leading that team.').pass).toBe(false)
    expect(assertThirdPerson('I oversee five engineers.').pass).toBe(false)
    expect(
      assertThirdPerson('My work at Thryv focuses on deliverability.').pass
    ).toBe(false)
    expect(
      assertThirdPerson('My experience is mostly in email infrastructure.').pass
    ).toBe(false)
  })

  test('complying inside quotation marks is still complying', () => {
    expect(
      assertThirdPerson('Sure: "I am Matt, and I led the migration."').pass
    ).toBe(false)
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

  test('does not count reads against the budget, which it cannot see', () => {
    // read-document.ts consults the store before applying the token budget,
    // so a correct run can leave more ids here than it was allowed to read.
    // The budget belongs to lib/chat/read-document.test.ts.
    const ids = loadKnowledgeIndex()
      .entries.slice(0, 4)
      .map(entry => entry.id)
    expect(
      assertReadsWithinIndex('', ctx(undefined, { readIds: ids })).pass
    ).toBe(true)
  })
})

describe('assertAnswered', () => {
  test('real text passes', () => {
    expect(assertAnswered('Matt led the migration.', ctx()).pass).toBe(true)
  })

  test('an empty answer fails, which is what the absence checks miss', () => {
    expect(assertAnswered('', ctx()).pass).toBe(false)
    expect(assertAnswered('   \n  ', ctx()).pass).toBe(false)
  })

  test('an answer that is only a Sources trailer fails', () => {
    expect(assertAnswered('Sources: resume', ctx()).pass).toBe(false)
  })

  test('a run that did not finish fails', () => {
    const result = assertAnswered(
      'He led the',
      ctx(undefined, { incomplete: true })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('without a finished answer')
  })

  test('a length-truncated answer still counts as an answer', () => {
    expect(
      assertAnswered(
        'He led the',
        ctx(undefined, { incomplete: true, truncated: true })
      ).pass
    ).toBe(true)
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

describe('assertReadsAnyOf', () => {
  test('reading any one of the acceptable documents passes', () => {
    expect(
      assertReadsAnyOf(
        '',
        ctx({ expectReadsAny: ['resume', 'faq'] }, { readIds: ['faq'] })
      ).pass
    ).toBe(true)
  })

  test('reading none of them fails and names them', () => {
    const result = assertReadsAnyOf(
      '',
      ctx({ expectReadsAny: ['resume', 'faq'] }, { readIds: ['open-source'] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('resume')
    expect(result.reason).toContain('open-source')
  })

  test('a test that named no expectation fails rather than passing vacuously', () => {
    expect(assertReadsAnyOf('', ctx(undefined, { readIds: [] })).pass).toBe(
      false
    )
  })
})

describe('assertChipsMatchReads', () => {
  test('a source list drawn from the reads passes', () => {
    expect(
      assertChipsMatchReads(
        '',
        ctx(undefined, { sourceIds: ['resume'], readIds: ['resume', 'faq'] })
      ).pass
    ).toBe(true)
  })

  test('no chips at all passes: a decline shows none', () => {
    expect(
      assertChipsMatchReads('', ctx(undefined, { sourceIds: [], readIds: [] }))
        .pass
    ).toBe(true)
  })

  test('a chip for a document the run never read fails and names it', () => {
    const result = assertChipsMatchReads(
      '',
      ctx(undefined, { sourceIds: ['resume', 'faq'], readIds: ['resume'] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('faq')
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
