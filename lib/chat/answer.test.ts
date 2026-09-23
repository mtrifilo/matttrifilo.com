import { describe, expect, test } from 'bun:test'
import {
  CHAT_UNKNOWN_ERROR_MESSAGE,
  FOLLOW_UPS_TRAILER_PREFIX,
  FOLLOW_UP_MAX_CHARS,
  SOURCES_TRAILER_PREFIX,
  announcementFor,
  discardsQuestion,
  findSourcesTrailer,
  joinTextParts,
  noticeFor,
  parseFollowUps,
  showsFollowUps,
  stripFollowUpsTrailer,
  stripSourcesTrailer,
  stripTrailers,
  toAnswerView,
  toChatErrorView,
  type AnswerMessage,
  type AnswerView,
} from './answer'
import { CHAT_ERROR_MESSAGE, chatErrorBody } from './validate'

const textPart = (text: string) => ({ type: 'text', text })

const answer = (
  parts: AnswerMessage['parts'],
  metadata?: AnswerMessage['metadata']
): AnswerMessage => ({ parts, metadata })

describe('joinTextParts', () => {
  test('concatenates the text parts in order', () => {
    expect(
      joinTextParts([textPart('Matt '), textPart('led '), textPart('it.')])
    ).toBe('Matt led it.')
  })

  test('ignores parts that are not text', () => {
    // The route filters non-text chunks server-side, so this is a backstop
    // rather than a case the UI expects to meet.
    expect(
      joinTextParts([
        { type: 'step-start' },
        textPart('Answer.'),
        { type: 'text' },
      ])
    ).toBe('Answer.')
  })
})

describe('stripSourcesTrailer', () => {
  test('removes the citation line the policy asks the model to write', () => {
    const text = `Matt shipped it.\n\n${SOURCES_TRAILER_PREFIX}resume, blog-agents`
    expect(stripSourcesTrailer(text)).toBe('Matt shipped it.')
  })

  test('removes a trailer that is the whole message', () => {
    expect(stripSourcesTrailer(`${SOURCES_TRAILER_PREFIX}resume`)).toBe('')
  })

  test('removes a trailer as soon as its prefix is complete', () => {
    // Mid-stream: the ids have not arrived yet, but the line is already
    // recognisable, so it never flashes up as prose.
    expect(stripSourcesTrailer('Matt shipped it.\nSources:')).toBe(
      'Matt shipped it.'
    )
  })

  test('leaves an answer that merely mentions sources alone', () => {
    const text = 'Sources for that claim are named in the résumé.'
    expect(stripSourcesTrailer(text)).toBe(text)
  })

  test('leaves a bullet that starts with S alone', () => {
    const text = 'He led two teams:\n\n- Shipped the eval suite'
    expect(stripSourcesTrailer(text)).toBe(text)
  })

  test('only takes the final line', () => {
    const text = `${SOURCES_TRAILER_PREFIX}resume\n\nAnd then he shipped it.`
    expect(stripSourcesTrailer(text)).toBe(text)
  })

  test.each(['\n', '\n\n', ' \n'])(
    'still removes a trailer the model ended with %j',
    ending => {
      // Models routinely finish with a newline; the first UI review found
      // the trailer surviving one and showing raw document ids.
      const text = `Matt shipped it.\n\n${SOURCES_TRAILER_PREFIX}resume${ending}`
      expect(stripSourcesTrailer(text)).toBe('Matt shipped it.')
    }
  )
})

describe('findSourcesTrailer', () => {
  test('splits the prose from the ids the line names, in order', () => {
    expect(
      findSourcesTrailer(
        `Matt shipped it.\n\n${SOURCES_TRAILER_PREFIX}resume, blog-agents`
      )
    ).toEqual({ prose: 'Matt shipped it.', ids: ['resume', 'blog-agents'] })
  })

  test('trims each id of whitespace and a closing full stop or semicolon', () => {
    expect(
      findSourcesTrailer('Text.\nSources:  resume; ,  faq. \n')?.ids
    ).toEqual(['resume', 'faq'])
  })

  test('finds the line under the follow-ups block, as stripTrailers does', () => {
    const text = `Matt shipped it.\n${SOURCES_TRAILER_PREFIX}resume\nFollow-ups:\nWhat does his team own?`
    expect(findSourcesTrailer(text)).toEqual({
      prose: 'Matt shipped it.',
      ids: ['resume'],
    })
    expect(stripTrailers(text)).toBe('Matt shipped it.')
  })

  test('a line with no ids yet is still the citation line', () => {
    expect(findSourcesTrailer('Matt shipped it.\nSources:')).toEqual({
      prose: 'Matt shipped it.',
      ids: [],
    })
  })

  test('is undefined wherever stripTrailers leaves the text on screen', () => {
    for (const text of [
      'Matt shipped it.',
      'Matt shipped it.\n**Sources:** resume',
      'Matt shipped it.\nsources: resume',
      `${SOURCES_TRAILER_PREFIX}resume\n\nAnd then he shipped it.`,
    ]) {
      expect(findSourcesTrailer(text)).toBeUndefined()
      expect(stripTrailers(text)).toBe(text)
    }
  })
})

const followUpsBlock = (...questions: string[]) =>
  [FOLLOW_UPS_TRAILER_PREFIX, ...questions].join('\n')

const ANSWER_WITH_TRAILERS = [
  'Matt shipped it.',
  '',
  `${SOURCES_TRAILER_PREFIX}resume`,
  followUpsBlock(
    'What did the throughput study measure?',
    'What confounders does Matt name?'
  ),
].join('\n')

describe('stripFollowUpsTrailer', () => {
  test('removes the marker and every question under it', () => {
    expect(stripFollowUpsTrailer(ANSWER_WITH_TRAILERS)).toBe(
      `Matt shipped it.\n\n${SOURCES_TRAILER_PREFIX}resume`
    )
  })

  test('removes the marker as soon as it is complete', () => {
    // Mid-stream: the questions have not arrived, but the line is already
    // recognisable, so it never flashes up as prose.
    expect(
      stripFollowUpsTrailer(`Matt shipped it.\n${FOLLOW_UPS_TRAILER_PREFIX}`)
    ).toBe('Matt shipped it.')
  })

  test('leaves an answer that has no marker alone', () => {
    const text = 'He followed up with the vendor the next week.'
    expect(stripFollowUpsTrailer(text)).toBe(text)
  })
})

describe('stripTrailers', () => {
  test('takes both trailers off, in the order they were written', () => {
    expect(stripTrailers(ANSWER_WITH_TRAILERS)).toBe('Matt shipped it.')
  })

  test('still takes a citation line off an answer with no follow-ups', () => {
    expect(
      stripTrailers(`Matt shipped it.\n${SOURCES_TRAILER_PREFIX}resume`)
    ).toBe('Matt shipped it.')
  })

  test.each(['F', 'Foll', 'Follow-ups', 'Follow-ups:'])(
    'hides the citation line while the marker is only %j',
    partial => {
      // The frames between the two trailers. Without this the raw document
      // ids stop being the final line and render as a paragraph.
      expect(
        stripTrailers(
          `Matt shipped it.\n\n${SOURCES_TRAILER_PREFIX}resume\n${partial}`
        )
      ).toBe('Matt shipped it.')
    }
  )

  test('leaves a final line that only looks like the start of a marker', () => {
    // No citation line above it, so there are no ids at stake and nothing to
    // guess about.
    const text = 'He shipped it.\nFol'
    expect(stripTrailers(text)).toBe(text)
  })
})

describe('the marker the policy and the parser share', () => {
  test('the prefix the policy writes is a marker the parser takes', () => {
    // The pattern is written out rather than built from the constant, so
    // this is what stops the two drifting apart.
    expect(
      parseFollowUps(`${FOLLOW_UPS_TRAILER_PREFIX}\nWhat does his team own?`)
    ).toEqual(['What does his team own?'])
  })
})

describe('showsFollowUps', () => {
  const answered = (overrides: Partial<AnswerView> = {}): AnswerView => ({
    text: 'He led the platform migration.',
    followUps: ['What does his team own?'],
    truncated: false,
    incomplete: false,
    ...overrides,
  })

  const state = (overrides: Partial<Parameters<typeof showsFollowUps>[0]>) => ({
    view: answered(),
    isLast: true,
    ready: true,
    stopped: false,
    ...overrides,
  })

  test('a finished last answer with proposals shows the row', () => {
    expect(showsFollowUps(state({}))).toBe(true)
  })

  test.each([
    ['an earlier turn', { isLast: false }],
    ['a run still in flight', { ready: false }],
    ['a run the visitor stopped', { stopped: true }],
    ['a run that did not finish', { view: answered({ incomplete: true }) }],
    ['an answer cut off on the cap', { view: answered({ truncated: true }) }],
    ['an answer with no text', { view: answered({ text: '  ' }) }],
    [
      'a decline, which proposes nothing',
      { view: answered({ followUps: [] }) },
    ],
  ])('%s shows none', (_name, overrides) => {
    expect(showsFollowUps(state(overrides))).toBe(false)
  })
})

describe('parseFollowUps', () => {
  test('reads the questions under the marker, in order', () => {
    expect(parseFollowUps(ANSWER_WITH_TRAILERS)).toEqual([
      'What did the throughput study measure?',
      'What confounders does Matt name?',
    ])
  })

  test('is empty when the answer proposed nothing', () => {
    expect(
      parseFollowUps(`Matt shipped it.\n${SOURCES_TRAILER_PREFIX}resume`)
    ).toEqual([])
  })

  test.each([
    ['bolded', '**Follow-ups:**'],
    ['under a heading mark', '## Follow-ups:'],
    ['lower case', 'follow-ups:'],
    ['spaced instead of hyphenated', 'Follow ups:'],
    ['indented', '   Follow-ups:'],
    ['italicised', '_Follow-ups:_'],
    ['written without its colon', '**Follow-ups**'],
    ['typeset with an en dash', 'Follow–ups:'],
    ['quoted as a block', '> Follow-ups:'],
  ])('recognises a marker that is %s', (_name, marker) => {
    // Bolding a label is one of the commonest things a model does to it, and
    // a marker the parser misses leaves the whole block on the page.
    const text = `Matt shipped it.\n${marker}\nWhat does his team own?`
    expect(parseFollowUps(text)).toEqual(['What does his team own?'])
    expect(stripFollowUpsTrailer(text)).toBe('Matt shipped it.')
  })

  test('leaves a sentence that merely opens with the words alone', () => {
    // The marker has to be the whole line. Without that rule an answer about
    // how Matt runs a review would lose everything below this sentence.
    const text = [
      'He runs a weekly review.',
      'Follow-ups: tracked in Linear, one owner each.',
      'He also publishes the notes.',
    ].join('\n')
    expect(stripFollowUpsTrailer(text)).toBe(text)
    expect(parseFollowUps(text)).toEqual([])
  })

  test('takes the first marker when a model writes two', () => {
    // Last-marker-wins would leave the earlier block on screen as prose.
    const text = [
      'Matt shipped it.',
      FOLLOW_UPS_TRAILER_PREFIX,
      'What does his team own?',
      FOLLOW_UPS_TRAILER_PREFIX,
      'Who reports to him?',
    ].join('\n')
    expect(stripFollowUpsTrailer(text)).toBe('Matt shipped it.')
    expect(parseFollowUps(text)).toEqual(['What does his team own?'])
  })

  test('keeps the proposals around one that breaks a rule', () => {
    // A stray character in one line is not a reason to withhold the row.
    expect(
      parseFollowUps(
        followUpsBlock(
          'What was the #1 delivery bottleneck?',
          'What does his team own?',
          'Who reports to him?'
        )
      )
    ).toEqual(['What does his team own?', 'Who reports to him?'])
  })

  test('unwraps the quotes a model puts round a question', () => {
    expect(parseFollowUps(followUpsBlock('"What does his team own?"'))).toEqual(
      ['What does his team own?']
    )
  })

  test('strips the bullet a model puts in front of a list item', () => {
    expect(
      parseFollowUps(
        followUpsBlock('- What does his team own?', '2. Who reports to him?')
      )
    ).toEqual(['What does his team own?', 'Who reports to him?'])
  })

  test('skips the blank lines models space a list with', () => {
    expect(
      parseFollowUps(
        followUpsBlock('What does his team own?', '', 'Who reports to him?')
      )
    ).toEqual(['What does his team own?', 'Who reports to him?'])
  })

  test('offers at most three, and never the same one twice', () => {
    expect(
      parseFollowUps(
        followUpsBlock(
          'What does his team own?',
          'WHAT DOES HIS TEAM OWN?',
          'Who reports to him?',
          'How big is the team?',
          'What is the on-call rotation?'
        )
      )
    ).toEqual([
      'What does his team own?',
      'Who reports to him?',
      'How big is the team?',
    ])
  })

  test('stops at prose the model wrote after its list', () => {
    // Anything past the first line that is not a question is the model
    // ignoring "write nothing after them", and nothing below it is promoted.
    expect(
      parseFollowUps(
        followUpsBlock(
          'What does his team own?',
          'Let me know if you want more detail.',
          'Who reports to him?'
        )
      )
    ).toEqual(['What does his team own?'])
  })

  test.each([
    ['a statement rather than a question', 'His team owns outbound email.'],
    ['a fragment too short to be a question', 'Team own?'],
    ['a question past the length cap', `${'Why '.repeat(40)}?`],
    ['a link to follow', 'What is at https://example.com/matt?'],
    ['a link under another scheme', 'What is at ftp://example.com/matt?'],
    ['a bare host with a path', 'Is evil.example/verify his portfolio?'],
    ['a www host', 'Is www.evil.example his portfolio?'],
    ['an address to write to', 'Should I email matt@example.com about it?'],
    ['a markdown link', 'What is [decant](https://example.com)?'],
    ['emphasis the renderer would act on', 'What does *his* team own?'],
    ['markup the renderer would act on', 'What is <b>his</b> team?'],
    ['a bidi override', 'What does ‮his team‬ own?'],
    ['a zero-width character', 'What does his​ team own?'],
    ['a tag character', 'What does his team own\u{E0041}?'],
  ])('drops %s', (_name, line) => {
    expect(parseFollowUps(followUpsBlock(line))).toEqual([])
  })

  test('keeps the questions this corpus actually asks', () => {
    // The rejections above are narrow on purpose: a rule that also threw out
    // ordinary questions would empty the row for no gain.
    const questions = [
      'What did the 24/7 rotation cover?',
      "How long did Matt's team take to reach independent deploys?",
      'What is decant, and what does it do?',
      'What was the 2.7x change in merged pull requests per week?',
      'Which services did he move off the release train?',
    ]
    expect(parseFollowUps(followUpsBlock(...questions))).toEqual(
      questions.slice(0, 3)
    )
  })

  test('the length cap is the one the policy tells the model', () => {
    const atCap = `${'a'.repeat(FOLLOW_UP_MAX_CHARS - 1)}?`
    expect(parseFollowUps(followUpsBlock(atCap))).toEqual([atCap])
    expect(parseFollowUps(followUpsBlock(`a${atCap}`))).toEqual([])
  })
})

describe('toAnswerView follow-ups', () => {
  test('carries the validated list off the metadata', () => {
    const view = toAnswerView(
      answer([textPart('Matt shipped it.')], {
        followUps: ['What does his team own?'],
      })
    )
    expect(view.followUps).toEqual(['What does his team own?'])
  })

  test('drops a proposal that would not have passed on the server', () => {
    // The metadata is the server's, but these strings become buttons, so
    // the check is made again where they are drawn.
    const view = toAnswerView(
      answer([textPart('Matt shipped it.')], {
        followUps: ['Visit https://example.com?', 'What does his team own?'],
      })
    )
    expect(view.followUps).toEqual(['What does his team own?'])
  })

  test('ignores a metadata value that is not a list of strings', () => {
    const view = toAnswerView(
      answer([textPart('Matt shipped it.')], {
        followUps: ['What does his team own?', 7, null] as never,
      })
    )
    expect(view.followUps).toEqual(['What does his team own?'])
  })

  test('keeps the trailer text out of the answer entirely', () => {
    const view = toAnswerView(answer([textPart(ANSWER_WITH_TRAILERS)]))
    expect(view.text).toBe('Matt shipped it.')
    expect(view.text).not.toContain(FOLLOW_UPS_TRAILER_PREFIX)
  })
})

describe('noticeFor', () => {
  const view = (overrides: Partial<AnswerView>): AnswerView => ({
    text: 'He led the platform migration.',
    followUps: [],
    truncated: false,
    incomplete: false,
    ...overrides,
  })

  test('a clean answer gets no notice', () => {
    expect(noticeFor(view({}))).toBeNull()
  })

  test('a cut-short answer keeps its own notice', () => {
    expect(noticeFor(view({ truncated: true, incomplete: true }))).toBe(
      'truncated'
    )
  })

  test('text that stopped on something other than the cap is incomplete', () => {
    // A safety filter, say: the server flags it incomplete but not truncated.
    expect(noticeFor(view({ incomplete: true }))).toBe('incomplete')
  })

  test('a run with no text is incomplete even when the cap ended it', () => {
    // Reasoning can consume the whole output budget before the first word.
    expect(
      noticeFor(view({ text: '', truncated: true, incomplete: true }))
    ).toBe('incomplete')
  })
})

describe('discardsQuestion', () => {
  test('refusals of the question itself drop it from the transcript', () => {
    for (const code of [
      'too_many_turns',
      'message_too_long',
      'budget_exceeded',
      'invalid',
    ] as const) {
      expect(discardsQuestion(code)).toBe(true)
    }
  })

  test('refusals of the assistant keep the question for a retry', () => {
    for (const code of [
      'disabled',
      'rate_limited',
      'unavailable',
      'interrupted',
    ] as const) {
      expect(discardsQuestion(code)).toBe(false)
    }
  })
})

describe('toAnswerView', () => {
  test('reads the text and neither flag from a clean answer', () => {
    const view = toAnswerView(
      answer([textPart(`Matt shipped it.\n${SOURCES_TRAILER_PREFIX}resume`)])
    )
    expect(view).toEqual({
      text: 'Matt shipped it.',
      followUps: [],
      truncated: false,
      incomplete: false,
      progress: undefined,
    })
  })

  test('a message with no metadata sets neither flag', () => {
    const view = toAnswerView(answer([textPart("That isn't something…")]))
    expect(view.incomplete).toBe(false)
    expect(view.truncated).toBe(false)
  })

  test('reports a cut-short answer as both truncated and incomplete', () => {
    const view = toAnswerView(
      answer([textPart('Matt led the mig')], {
        truncated: true,
        incomplete: true,
      })
    )
    expect(view.truncated).toBe(true)
    expect(view.incomplete).toBe(true)
    expect(view.text).toBe('Matt led the mig')
  })

  test('reports a run that never answered as incomplete with no text', () => {
    const view = toAnswerView(answer([], { incomplete: true }))
    expect(view).toEqual({
      text: '',
      followUps: [],
      truncated: false,
      incomplete: true,
      progress: undefined,
    })
  })
})

describe('announcementFor', () => {
  test('says nothing on a page nobody has asked anything on yet', () => {
    expect(announcementFor('ready', false)).toBe('')
  })

  test('announces the wait and the stream the same way', () => {
    expect(announcementFor('submitted', false)).toBe('Responding')
    expect(announcementFor('streaming', false)).toBe('Responding')
  })

  test('announces completion once an answer exists', () => {
    expect(announcementFor('ready', true)).toBe('Response complete')
  })

  test('announces a failure over anything else', () => {
    expect(announcementFor('error', true)).toBe('Error')
  })
})

describe('toChatErrorView', () => {
  test('is undefined when there is no error', () => {
    expect(toChatErrorView(undefined)).toBeUndefined()
  })

  test.each([
    'disabled',
    'blocked',
    'too_many_turns',
    'message_too_long',
    'budget_exceeded',
    'invalid',
    'unavailable',
    'interrupted',
  ] as const)("renders the route's own copy for %s", code => {
    // The transport rejects a non-2xx response with the raw body as the
    // message, so this is exactly what useChat hands the UI.
    const error = new Error(JSON.stringify(chatErrorBody(code)))
    expect(toChatErrorView(error)).toEqual({
      code,
      message: CHAT_ERROR_MESSAGE[code],
    })
  })

  test('recognises rate_limited, which MTC-34 will start sending', () => {
    const error = new Error(
      JSON.stringify({ error: { code: 'rate_limited', message: 'Slow down.' } })
    )
    expect(toChatErrorView(error)?.code).toBe('rate_limited')
  })

  test('falls back for a code this build does not know', () => {
    const error = new Error(
      JSON.stringify({ error: { code: 'teapot', message: 'Short and stout.' } })
    )
    expect(toChatErrorView(error)).toEqual({
      code: 'unavailable',
      message: CHAT_UNKNOWN_ERROR_MESSAGE,
    })
  })

  test.each([
    ['a transport failure', 'Failed to fetch the chat response.'],
    ['a browser network failure', 'Failed to fetch'],
    ['an HTML error page', '<!doctype html><title>502</title>'],
    ['an empty message', ''],
  ])('falls back for %s', (_name, message) => {
    // None of these were written by this route, so none of them is copy.
    expect(toChatErrorView(new Error(message))).toEqual({
      code: 'unavailable',
      message: CHAT_UNKNOWN_ERROR_MESSAGE,
    })
  })

  test('falls back when the body parses but has no message', () => {
    const error = new Error(JSON.stringify({ error: { code: 'disabled' } }))
    expect(toChatErrorView(error)?.message).toBe(CHAT_UNKNOWN_ERROR_MESSAGE)
  })
})
