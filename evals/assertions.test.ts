import { describe, expect, test } from 'bun:test'
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
  assertChipsMatchReads,
  assertCites,
  assertCitesOnlyWhatItRead,
  assertDecline,
  assertDeclineOrWithholds,
  assertCheckedActivity,
  assertDatesFromActivity,
  assertHasRecentDate,
  assertNoHandles,
  assertNoInventedFact,
  assertNoNarration,
  assertNoPolicyLeak,
  assertNoScreenshotRelease,
  assertNoTicketKeys,
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
    ['at the start', 'PSY-2080 added the gallery.'],
    ['in the middle', 'He merged PSY-2080 last week.'],
    ['in a list', 'Recent work: PSY-2079, PSY-2080 and PSY-2081.'],
  ])('a ticket key %s fails and is named', (_label, answer) => {
    const result = assertNoTicketKeys(answer)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('PSY-20')
  })

  test('a lowercase branch name is not a key', () => {
    expect(assertNoTicketKeys('The branch was psy-2080-gallery.').pass).toBe(
      true
    )
  })

  test('the sources trailer is not part of the answer', () => {
    // `answerProse` drops it, so a document id shaped like a key could not
    // redden a row about what the answer says.
    expect(
      assertNoTicketKeys('He shipped the gallery.\n\nSources: open-source').pass
    ).toBe(true)
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
})
