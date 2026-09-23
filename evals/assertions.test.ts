import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACTIVITY_BLOCK_NOTICE,
  ACTIVITY_BLOCK_START,
} from '@/lib/chat/github-activity'
import {
  DECLINE_SENTENCE,
  RECENT_ACTIVITY_TOOL_NAME,
  REPOSITORY_LIST_HEADING,
  SYSTEM_PROMPT,
} from '@/lib/chat/prompt'
import { loadKnowledgeIndex } from '@/lib/knowledge'
import {
  POLICY_PHRASES,
  assertAnswered,
  assertCites,
  isUncitedAnswer,
  assertCitesOnlyWhatItRead,
  assertDecline,
  assertDeclineOrWithholds,
  assertFollowUpsAnswerable,
  assertCheckedActivity,
  assertDatesFromActivity,
  assertHasRecentDate,
  assertNoEmDash,
  assertNoHandles,
  assertNoInventedFact,
  assertNoNarration,
  assertNoPolicyLeak,
  assertNoScreenshotRelease,
  assertNoTicketKeys,
  assertReadsAnyOf,
  assertReadsAnySet,
  assertReadsExpected,
  assertReadsWithinIndex,
  assertThirdPerson,
  followUpToAsk,
  type AssertionContext,
  type SuiteTestMetadata,
} from './assertions'
import type { EvalMetadata } from './provider'

const ctx = (
  test?: SuiteTestMetadata,
  provider?: Partial<EvalMetadata>
): AssertionContext => ({ test: { metadata: test }, metadata: provider })

describe('AssertionContext', () => {
  // Checked by `bun run typecheck`, not at run time: each directive fails the
  // build if the line under it ever compiles. A read of a key the provider
  // does not set would be undefined on every row, and an assertion built on
  // it would pass without looking at anything.
  test('a key the provider never sets does not compile', () => {
    const context: AssertionContext = { metadata: { readIds: [] } }
    // @ts-expect-error: sourceIds is not provider metadata
    expect(context.metadata?.sourceIds).toBeUndefined()
  })

  test('a key no suite sets does not compile either', () => {
    const context: AssertionContext = { test: { metadata: {} } }
    // @ts-expect-error: expectRead is a misspelling of expectReads
    expect(context.test?.metadata?.expectRead).toBeUndefined()
  })
})

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

describe('assertNoNarration', () => {
  test('a briefing passes', () => {
    expect(
      assertNoNarration(
        'Matt proposed, designed, and built the AI Email Engagement Summary.'
      ).pass
    ).toBe(true)
  })

  test('the decline sentence passes', () => {
    expect(assertNoNarration(DECLINE_SENTENCE).pass).toBe(true)
  })

  test('tool-step preamble fails', () => {
    const result = assertNoNarration(
      'Let me check his résumé.\n\nMatt leads Email Reliability.'
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('Let me check')
  })

  test('naming the tool fails', () => {
    expect(
      assertNoNarration('I will call read_document on the résumé next.').pass
    ).toBe(false)
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

describe('assertReadsAnySet', () => {
  const sets = [['resume'], ['merge-api-decomposition', 'contacts-api']]

  test('reading the one-document set passes', () => {
    const result = assertReadsAnySet(
      '',
      ctx({ expectReadsAnySet: sets }, { readIds: ['faq', 'resume'] })
    )
    expect(result.pass).toBe(true)
    expect(result.reason).toBe('read all of resume')
  })

  test('reading every document of the other set passes', () => {
    const result = assertReadsAnySet(
      '',
      ctx(
        { expectReadsAnySet: sets },
        { readIds: ['contacts-api', 'merge-api-decomposition'] }
      )
    )
    expect(result.pass).toBe(true)
    expect(result.reason).toBe(
      'read all of merge-api-decomposition, contacts-api'
    )
  })

  test('reading half of a set fails and names every alternative', () => {
    const result = assertReadsAnySet(
      '',
      ctx({ expectReadsAnySet: sets }, { readIds: ['merge-api-decomposition'] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toBe(
      'read no complete set of resume or merge-api-decomposition + contacts-api; read merge-api-decomposition'
    )
  })

  test('an empty set is not satisfied by reading nothing', () => {
    expect(
      assertReadsAnySet(
        '',
        ctx({ expectReadsAnySet: [[], ['resume']] }, { readIds: [] })
      ).pass
    ).toBe(false)
    expect(
      assertReadsAnySet('', ctx({ expectReadsAnySet: [[]] }, { readIds: [] }))
        .reason
    ).toContain('named no')
  })

  test('a test that named no expectation fails rather than passing vacuously', () => {
    expect(assertReadsAnySet('', ctx(undefined, { readIds: [] })).pass).toBe(
      false
    )
    expect(
      assertReadsAnySet(
        '',
        ctx({ expectReadsAnySet: ['resume'] }, { readIds: ['resume'] })
      ).pass
    ).toBe(false)
  })
})

describe('followUpToAsk', () => {
  const question =
    'How did Matt handle the February 2024 cloud-provider outage?'

  test('the same question on the same day asks the same position', () => {
    expect(followUpToAsk(3, question, 20_719)).toBe(
      followUpToAsk(3, question, 20_719)
    )
  })

  test('consecutive days rotate one question through every position', () => {
    for (const count of [1, 2, 3]) {
      const positions = Array.from({ length: count }, (_, offset) =>
        followUpToAsk(count, question, 20_719 + offset)
      )
      expect([...positions].sort()).toEqual(
        Array.from({ length: count }, (_, i) => i)
      )
    }
  })

  test('the next day moves to the next position, wrapping at the end', () => {
    const today = followUpToAsk(3, question, 20_719)
    expect(followUpToAsk(3, question, 20_720)).toBe((today + 1) % 3)
  })

  test('always an index into the proposals, whatever the day', () => {
    for (const day of [-5, 0, 1, 20_719, 2 ** 40]) {
      for (const count of [1, 2, 3]) {
        const position = followUpToAsk(count, question, day)
        expect(Number.isInteger(position)).toBe(true)
        expect(position).toBeGreaterThanOrEqual(0)
        expect(position).toBeLessThan(count)
      }
    }
  })

  test('the goldens that carry the check do not all ask the same position in one run', () => {
    // Within a run the day is shared, so this depends only on the questions'
    // hashes: it holds on every day if it holds on one.
    const golden = Bun.YAML.parse(
      readFileSync(join(import.meta.dir, 'suites/golden.yaml'), 'utf8')
    ) as { vars?: { question?: string }; assert?: { value?: unknown }[] }[]
    const questions = golden
      .filter(item =>
        (item.assert ?? []).some(
          entry =>
            entry.value === 'file://assertions.ts:assertFollowUpsAnswerable'
        )
      )
      .map(item => String(item.vars?.question))
    expect(questions.length).toBeGreaterThan(1)
    for (const count of [2, 3]) {
      const positions = new Set(
        questions.map(q => followUpToAsk(count, q, 20_719))
      )
      expect(positions.size).toBeGreaterThan(1)
    }
  })

  test('refuses a count with nothing to choose from', () => {
    expect(() => followUpToAsk(0, question, 20_719)).toThrow(RangeError)
    expect(() => followUpToAsk(1.5, question, 20_719)).toThrow(RangeError)
  })
})

describe('assertFollowUpsAnswerable', () => {
  // Only the branches that decide before a second model call are exercised
  // here; the call itself is what an eval run is for, and `bun test` makes
  // none.
  test('an answer that proposed nothing fails and says so', async () => {
    const result = await assertFollowUpsAnswerable(
      'He led it.',
      ctx(undefined, { followUps: [] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('no follow-up')
  })

  test('a test with no question of its own fails rather than guessing', async () => {
    const result = await assertFollowUpsAnswerable('He led it.', {
      metadata: { followUps: ['What does his team own?'] },
    })
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('no question')
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

  test('a trailer on a run that read nothing fails', () => {
    const result = assertCitesOnlyWhatItRead(
      'He led it.\n\nSources: resume',
      ctx(undefined, { readIds: [] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('resume')
  })
})

describe('the citation trio: assertCites, assertCitesOnlyWhatItRead, assertAnswered', () => {
  // Every test that carries one carries all three (evals/config.test.ts), so
  // a row's citation verdict is the trio's. Each case names every member, so
  // a red one says which moved.
  const verdicts = (output: string, context: AssertionContext) => ({
    assertCites: assertCites(output, context).pass,
    assertCitesOnlyWhatItRead: assertCitesOnlyWhatItRead(output, context).pass,
    assertAnswered: assertAnswered(output, context).pass,
  })
  const answer = 'He led the migration in 2024.'
  const readResume = ctx(
    { expectReadsAny: ['resume'] },
    { readIds: ['resume', 'faq'] }
  )

  test('a trailer drawn from the reads passes all three', () => {
    expect(verdicts(`${answer}\n\nSources: resume`, readResume)).toEqual({
      assertCites: true,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: true,
    })
  })

  test('a trailer naming an unread document fails the subset check', () => {
    expect(
      verdicts(`${answer}\n\nSources: resume, open-source`, readResume)
    ).toEqual({
      assertCites: true,
      assertCitesOnlyWhatItRead: false,
      assertAnswered: true,
    })
  })

  test('no trailer, on a run that read the named document, passes with a warning', () => {
    // The tolerance `missingTrailer` counts: the subset check has nothing to
    // disagree with, and assertCites passes on the ledger's evidence.
    expect(verdicts(answer, readResume)).toEqual({
      assertCites: true,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: true,
    })
    expect(assertCites(answer, readResume).reason).toContain('warning')
  })

  test('no trailer, on a run that did not read the named document, fails', () => {
    const readOther = ctx(
      { expectReadsAny: ['resume'] },
      { readIds: ['owned-systems-and-operations'] }
    )
    expect(verdicts(answer, readOther)).toEqual({
      assertCites: false,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: true,
    })
  })

  test('no trailer, on a run that read nothing, fails', () => {
    const readNothing = ctx({ expectReadsAny: ['resume'] }, { readIds: [] })
    expect(verdicts(answer, readNothing)).toEqual({
      assertCites: false,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: true,
    })
  })

  test('an empty answer fails, whatever the run read', () => {
    expect(verdicts('', readResume)).toEqual({
      assertCites: false,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: false,
    })
  })

  test('a trailer with no answer above it fails', () => {
    expect(verdicts('Sources: resume', readResume)).toEqual({
      assertCites: false,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: false,
    })
  })

  test('a decline carrying a trailer of read documents fails', () => {
    // The ids were read and the trailer is there, but there is no answer for
    // it to cite, so only assertCites can catch it.
    expect(
      verdicts(`${DECLINE_SENTENCE}\n\nSources: resume`, readResume)
    ).toEqual({
      assertCites: false,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: true,
    })
  })

  test('an uncited answer cut off at the output cap passes with a warning', () => {
    // assertAnswered counts a length-truncated answer as an answer, so the
    // trio passes it and the provider counts it as a missing trailer: the
    // cap, not the model, is what took the line off.
    const capped = ctx(
      { expectReadsAny: ['resume'] },
      { readIds: ['resume'], incomplete: true, truncated: true }
    )
    expect(verdicts('He led the migr', capped)).toEqual({
      assertCites: true,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: true,
    })
    expect(assertCites('He led the migr', capped).reason).toContain('warning')
  })

  test('a cited answer that stopped short, not on the output cap, fails on the answer', () => {
    const cutOff = ctx(
      { expectReadsAny: ['resume'] },
      { readIds: ['resume'], incomplete: true }
    )
    expect(verdicts('He led the\nSources: resume', cutOff)).toEqual({
      assertCites: true,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: false,
    })
  })

  test('a bold trailer is no trailer, as it is on the page', () => {
    // The page leaves this line on screen, raw ids and all, so it is not a
    // citation line; tolerated only on the ledger's evidence, and counted.
    const bold = `${answer}\n\n**Sources:** resume`
    expect(verdicts(bold, readResume)).toEqual({
      assertCites: true,
      assertCitesOnlyWhatItRead: true,
      assertAnswered: true,
    })
    expect(assertCites(bold, readResume).reason).toContain('warning')
    expect(isUncitedAnswer(bold, ['resume'])).toBe(true)
  })
})

describe('assertCites', () => {
  const answer = 'He led the migration in 2024.'
  // What a groundedness citation test looks like: the document it expects,
  // and the ledger of what the run opened.
  const read = ctx({ expectReadsAny: ['resume'] }, { readIds: ['resume'] })
  const readNothing = ctx({ expectReadsAny: ['resume'] }, { readIds: [] })

  test('requires a trailer', () => {
    expect(assertCites(`${answer}\n\nSources: resume`, readNothing).pass).toBe(
      true
    )
    expect(assertCites(answer, readNothing).pass).toBe(false)
  })

  test('warns instead of failing when the run read the expected document', () => {
    // The flake this tolerates: a correct, sourced answer that dropped one
    // line of formatting. The provider counts it and the publish gate refuses
    // a run where it happens often, which is what keeps this honest.
    const result = assertCites(answer, read)
    expect(result.pass).toBe(true)
    expect(result.reason).toContain('warning')
    expect(result.reason).toContain('resume')
  })

  test('does not tolerate a miss on the strength of any read at all', () => {
    // `readIds` is a superset of what the answer saw, so "it opened
    // something" is not evidence that THIS answer used a document.
    const other = ctx(
      { expectReadsAny: ['resume'] },
      { readIds: ['owned-systems-and-operations'] }
    )
    const result = assertCites(answer, other)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('resume')
  })

  test('does not tolerate a miss on a test that expects no document', () => {
    const result = assertCites(answer, ctx(undefined, { readIds: ['resume'] }))
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('names no document')
  })

  test('still fails an answer on a run that read nothing', () => {
    expect(assertCites(answer, readNothing).pass).toBe(false)
    expect(assertCites(answer, readNothing).reason).toContain(
      'opened no document'
    )
  })

  test('still fails an empty answer, whatever the run read', () => {
    expect(assertCites('', read).pass).toBe(false)
    expect(assertCites('   \n', read).pass).toBe(false)
  })

  test('still fails a decline, whatever the run read', () => {
    // A groundedness question the corpus answers must not pass by declining
    // it after opening the document.
    expect(assertCites(DECLINE_SENTENCE, read).pass).toBe(false)
    expect(
      assertCites("Matt's published work does not mention that.", read).pass
    ).toBe(false)
  })

  test('fails a decline even when it carries a trailer', () => {
    for (const trailer of ['Sources: resume', 'Sources: resume, faq']) {
      const result = assertCites(`${DECLINE_SENTENCE}\n\n${trailer}`, read)
      expect(result.pass).toBe(false)
      expect(result.reason).toContain('decline sentence')
    }
  })

  test('fails a decline with a line added, or under a trailer the page shows', () => {
    // Neither is the sentence alone, and neither is an answer: the route
    // withholds follow-ups from any text that carries the sentence, and so
    // does this. A bold label is prose on the page, so without this the
    // missing-trailer tolerance would pass the decline with a warning.
    for (const output of [
      `${DECLINE_SENTENCE} Sorry!\n\nSources: resume`,
      `${DECLINE_SENTENCE}\n\n**Sources:** resume`,
      `${DECLINE_SENTENCE} Sorry!`,
    ]) {
      const result = assertCites(output, read)
      expect({ output, pass: result.pass }).toEqual({ output, pass: false })
      expect(result.reason).toContain('decline sentence')
      expect(isUncitedAnswer(output, ['resume'])).toBe(false)
    }
  })

  test('fails a trailer with no answer above it', () => {
    for (const output of ['Sources: resume', '\n\nSources: resume\n']) {
      const result = assertCites(output, read)
      expect(result.pass).toBe(false)
      expect(result.reason).toContain('no answer text')
    }
  })

  test('fails a trailer under nothing but follow-up questions', () => {
    // The block comes off before the prose is judged, so proposals are not
    // an answer for the line to cite.
    expect(
      assertCites('Sources: resume\nFollow-ups:\nWhat does his team own?', read)
        .pass
    ).toBe(false)
  })

  test('passes a cited answer that says one detail is not covered', () => {
    // Only the decline sentence is a decline once a trailer is there: an
    // answer that cites the document and names the one thing it leaves out
    // is a sourced answer, and the phrases that read as a disclaimer on an
    // uncited answer are ordinary in one.
    expect(
      assertCites(
        "He led it in 2024. The résumé doesn't say how large the team was.\n\nSources: resume",
        read
      ).pass
    ).toBe(true)
  })

  test('a disclaimer with no trailer names what it said in its reason', () => {
    const result = assertCites(
      "Matt's published work does not mention that.",
      read
    )
    expect(result.reason).toContain('does not cover the question')
  })
})

describe('isUncitedAnswer', () => {
  // The one definition the provider's `missingTrailer` flag and the tolerance
  // above both use.
  test('true only for a real answer that read a document and cited none', () => {
    expect(isUncitedAnswer('He led it.', ['resume'])).toBe(true)
    expect(isUncitedAnswer('He led it.\n\nSources: resume', ['resume'])).toBe(
      false
    )
    expect(isUncitedAnswer('He led it.', [])).toBe(false)
    expect(isUncitedAnswer('', ['resume'])).toBe(false)
    expect(isUncitedAnswer(DECLINE_SENTENCE, ['resume'])).toBe(false)
    expect(
      isUncitedAnswer("Matt's work does not mention that.", ['resume'])
    ).toBe(false)
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

describe('assertCheckedActivity', () => {
  test('a superset of the expected checks passes', () => {
    expect(
      assertCheckedActivity(
        '',
        ctx(
          { expectActivity: ['psychic-homily-web'] },
          { activityRepos: ['psychic-homily-web', 'decant'] }
        )
      ).pass
    ).toBe(true)
  })

  test('a missing check fails and names the repository', () => {
    const result = assertCheckedActivity(
      '',
      ctx({ expectActivity: ['decant'] }, { activityRepos: [] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('decant')
  })

  test('a test that named no expectation fails rather than passing vacuously', () => {
    expect(
      assertCheckedActivity('', ctx(undefined, { activityRepos: ['decant'] }))
        .pass
    ).toBe(false)
  })
})

describe('assertHasRecentDate', () => {
  const thisYear = new Date().getUTCFullYear()

  test('this year passes', () => {
    expect(
      assertHasRecentDate(`He merged the parser rewrite in March ${thisYear}.`)
        .pass
    ).toBe(true)
  })

  test('last year passes, so a January question is not failed for honesty', () => {
    expect(
      assertHasRecentDate(`The last release was ${thisYear - 1}-12-02.`).pass
    ).toBe(true)
  })

  test('an undated answer fails', () => {
    expect(
      assertHasRecentDate('He has been shipping improvements to the CLI.').pass
    ).toBe(false)
  })

  test('a date from the corpus snapshot is not a recent date', () => {
    expect(assertHasRecentDate('He joined the team in 2013.').pass).toBe(false)
  })
})

describe('assertNoHandles', () => {
  test('an answer with no handle passes', () => {
    expect(
      assertNoHandles('He merged a fix for the clipboard fallback.').pass
    ).toBe(true)
  })

  test('the decline sentence passes: an email is not a handle', () => {
    expect(assertNoHandles(DECLINE_SENTENCE).pass).toBe(true)
  })

  test('a contributor handle fails and is named', () => {
    const result = assertNoHandles('The fix came from @dependabot.')
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('@dependabot')
  })

  test('a handle at the very start of the answer fails too', () => {
    expect(assertNoHandles('@someone opened the pull request.').pass).toBe(
      false
    )
  })

  test('a handle with an awkward prefix fails, as the filter now strips it', () => {
    // These three are what the anchored pattern missed. An assertion that
    // shares a blind spot with the filter it checks cannot catch the filter
    // failing, which is the whole reason it exists.
    for (const answer of [
      'credit -@evilhandle for the fix',
      'credit .@evilhandle for the fix',
      'review from @@evilhandle',
    ]) {
      expect(assertNoHandles(answer).pass).toBe(false)
    }
  })

  test("Matt's own email in a briefing is still not a handle", () => {
    expect(
      assertNoHandles(
        'He is reachable at matt.trifilo@gmail.com for the details.'
      ).pass
    ).toBe(true)
  })
})

describe('assertNoPolicyLeak, on the activity scaffolding', () => {
  test('the repository list heading is a leak', () => {
    expect(
      assertNoPolicyLeak(`Here is the list: ${REPOSITORY_LIST_HEADING}`).pass
    ).toBe(false)
  })

  test("a tool result's own framing is a leak", () => {
    expect(assertNoPolicyLeak(`He shipped ${ACTIVITY_BLOCK_START}`).pass).toBe(
      false
    )
    expect(assertNoPolicyLeak(ACTIVITY_BLOCK_NOTICE).pass).toBe(false)
  })

  test('naming the activity tool is a leak', () => {
    expect(
      assertNoPolicyLeak(`I called ${RECENT_ACTIVITY_TOOL_NAME}.`).pass
    ).toBe(false)
  })
})

describe('assertNoNarration, on the activity tool', () => {
  test('naming the second tool is narration too', () => {
    const result = assertNoNarration(
      `He shipped a parser fix; I used ${RECENT_ACTIVITY_TOOL_NAME} to check.`
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain(RECENT_ACTIVITY_TOOL_NAME)
  })
})

describe('assertDatesFromActivity', () => {
  const delivered = { activityDates: ['2026-09-18', '2026-09-20'] }

  test.each([
    ['an ISO date', 'He merged the parser fix on 2026-09-18.'],
    ['a long date', 'He merged the parser fix on 18 September 2026.'],
    ['an American date', 'He merged it September 18, 2026.'],
    ['an abbreviated month', 'Latest work landed Sept 2026.'],
    ['a month alone', 'Most of the recent work is from September 2026.'],
  ])('%s that the digest carried passes', (_label, answer) => {
    expect(
      assertDatesFromActivity(answer, ctx(undefined, delivered)).pass
    ).toBe(true)
  })

  test.each([
    [
      'a repository id that starts like a month',
      'He shipped decant, 2026 was busy.',
    ],
    ['another word that does', 'Marketing 2026 plans landed.'],
    ['and another', 'Maybe 2026 is the year.'],
  ])('%s is not a month', (_label, answer) => {
    // `decant` read as December through a three-letter prefix, and `decant`
    // is a repository id these answers contain by construction: the parser
    // had the false pass this assertion exists to prevent built into it.
    const result = assertDatesFromActivity(
      answer,
      ctx(undefined, {
        activityDates: ['2026-12-01', '2026-03-02', '2026-05-03'],
      })
    )
    expect(result.pass).toBe(false)
  })

  test.each([
    ['an ordinal', 'He merged it September 18th, 2026.'],
    ['an abbreviated ordinal', 'He merged it on Sept. 18th, 2026.'],
    ['a year-month with no day', 'The latest push was in 2026-09.'],
  ])('%s is still a date', (_label, answer) => {
    // Ordinary model phrasings. A red row for spelling teaches nobody
    // anything, and these two goldens run against a live repository.
    expect(
      assertDatesFromActivity(answer, ctx(undefined, delivered)).pass
    ).toBe(true)
  })

  test('a date the digest did not carry fails', () => {
    // The case the pair exists for: an answer written from the corpus, which
    // mentions the current year all over, with GitHub never consulted.
    const result = assertDatesFromActivity(
      'His open-source page was last updated in March 2026.',
      ctx(undefined, delivered)
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('2026-03')
  })

  test('an undated answer fails and says the digest had dates', () => {
    const result = assertDatesFromActivity(
      'He has been shipping improvements to the site.',
      ctx(undefined, delivered)
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('no date')
  })

  test('a run that never reached GitHub fails rather than passing empty', () => {
    const result = assertDatesFromActivity(
      'He merged the parser fix on 2026-09-18.',
      ctx(undefined, { activityDates: [] })
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('GitHub was never reached')
  })
})

describe('assertNoTicketKeys', () => {
  test('an answer with no key passes', () => {
    expect(
      assertNoTicketKeys(
        'He shipped a Wayland clipboard fallback in September.'
      ).pass
    ).toBe(true)
  })

  test.each([
    ['at the start', 'PSY-2080 added the gallery.', 'PSY-2080'],
    ['in the middle', 'He merged PSY-2081 last week.', 'PSY-2081'],
  ])('a ticket key %s fails and is named exactly', (_label, answer, key) => {
    const result = assertNoTicketKeys(answer)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain(key)
  })

  test('every key in the answer is named, not only the first', () => {
    // A red row that names one of three sends a reader back to the answer for
    // no reason.
    const result = assertNoTicketKeys(
      'Recent work: PSY-2079, PSY-2080 and PSY-2081.'
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('PSY-2079, PSY-2080, PSY-2081')
  })

  test('a lowercase branch name is not a key', () => {
    expect(assertNoTicketKeys('The branch was psy-2080-gallery.').pass).toBe(
      true
    )
  })

  test('a version and a standard are not keys either', () => {
    // The pattern's guards, from the other side: an answer may say these.
    for (const answer of [
      'He patched CVE-2024-1234 in the parser.',
      'He dropped TLS-1.2 support.',
      'He moved the checksum to AES-256-GCM.',
    ]) {
      expect(assertNoTicketKeys(answer).pass).toBe(true)
    }
  })

  test('a key in the sources trailer is not part of the answer', () => {
    // `answerProse` drops the trailer, so a document id shaped like a key
    // cannot redden a row about what the answer says. The key has to be
    // key-shaped for this test to exercise anything.
    const withKey = 'He shipped the gallery.\n\nSources: PSY-2080'
    expect(assertNoTicketKeys(withKey).pass).toBe(true)
    expect(assertNoTicketKeys('He shipped PSY-2080.').pass).toBe(false)
  })
})

describe('assertNoScreenshotRelease', () => {
  test('an answer that states no release passes', () => {
    expect(
      assertNoScreenshotRelease('He merged three pull requests in September.')
        .pass
    ).toBe(true)
  })

  test('the tag this check exists for fails and is named', () => {
    const result = assertNoScreenshotRelease(
      'His latest release is psy-2080-screenshots, from 16 September 2026.'
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('psy-2080-screenshots')
  })

  test('the word on its own is not a tag', () => {
    // An answer may say screenshots were added; only the tag shape is noise.
    expect(
      assertNoScreenshotRelease('He added screenshots to the README.').pass
    ).toBe(true)
  })

  test('an upload tag with something appended still fails', () => {
    // The shapes an end-anchored rule admitted.
    for (const answer of [
      'The latest release is v1.2.0-screenshots-2026-09-16.',
      'The latest release is v1.2.0-screenshots.zip.',
    ]) {
      expect(assertNoScreenshotRelease(answer).pass).toBe(false)
    }
  })
})

describe('assertNoEmDash', () => {
  // Built from code points so this file carries no dash of its own.
  const EM_DASH = String.fromCodePoint(0x2014)
  const EN_DASH = String.fromCodePoint(0x2013)

  test('an answer with no dash passes', () => {
    const answer =
      'Matt led the migration in 2024: his team cut lead time by half.\nSources: resume'
    expect(assertNoEmDash(answer).pass).toBe(true)
  })

  test('an em dash anywhere fails, and the reason quotes it', () => {
    for (const answer of [
      `Matt led the migration ${EM_DASH} and shipped it in 2024.`,
      `Matt led the migration${EM_DASH}and shipped it in 2024.`,
      `Matt led the migration.\n\nWhat did the migration measure ${EM_DASH} and when?`,
    ]) {
      const result = assertNoEmDash(answer)
      expect(result.pass).toBe(false)
      expect(result.reason).toContain('migration')
    }
  })

  test('the characters and entities that render as an em dash fail too', () => {
    for (const dash of [
      String.fromCodePoint(0x2015),
      String.fromCodePoint(0x2e3a),
      String.fromCodePoint(0xfe58),
      '&mdash;',
      '&#8212;',
      '&#x2014;',
    ]) {
      expect(assertNoEmDash(`He led it ${dash} and shipped it.`).pass).toBe(
        false
      )
    }
  })

  test('an en dash between spaces is a sentence dash and fails', () => {
    const result = assertNoEmDash(
      `Matt led the migration ${EN_DASH} and shipped it.`
    )
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('a dash')
  })

  test('an en dash in a range passes, spaced or not', () => {
    for (const answer of [
      `He was a Software Engineer I from Jul 2017 ${EN_DASH} Jul 2018.`,
      `He has managed the team since May 2025 ${EN_DASH} present.`,
      `The programme ran 2019${EN_DASH}2021.`,
      `It covered pages 10 ${EN_DASH} 12.`,
    ]) {
      expect(assertNoEmDash(answer).pass).toBe(true)
    }
  })

  test('a range wrapped in markdown is still a range', () => {
    for (const answer of [
      `He has managed the team since **May 2025** ${EN_DASH} **present**.`,
      `He was there from Jul 2017 ${EN_DASH} _present_.`,
      `See [Jul 2017](https://example.com) ${EN_DASH} present.`,
      `The work ran Q4 2024 ${EN_DASH} Q1 2025.`,
    ]) {
      expect(assertNoEmDash(answer).pass).toBe(true)
    }
  })

  test('a number before a spaced en dash does not excuse a sentence dash', () => {
    for (const answer of [
      `He joined in 2017 ${EN_DASH} and he led the team.`,
      `He shipped it in May ${EN_DASH} may I add, on time.`,
      `He joined in 2017 ${EN_DASH} now he leads the platform.`,
    ]) {
      expect(assertNoEmDash(answer).pass).toBe(false)
    }
  })

  test('a hyphen is not a dash', () => {
    expect(
      assertNoEmDash('He led a player-coach team.\n- one\n- two').pass
    ).toBe(true)
  })

  test('counts every dash it finds', () => {
    const result = assertNoEmDash(`One ${EM_DASH} two ${EN_DASH} three.`)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('2 dashes')
  })
})
