import { describe, expect, test } from 'bun:test'
import { BRITISH_SPELLINGS, findBritishSpellings } from './american-english'

const words = (text: string, kept?: readonly string[]) =>
  findBritishSpellings(text, kept).map(hit => hit.word)

describe('findBritishSpellings', () => {
  test('finds each form the brief starts the list with', () => {
    for (const word of [
      'programme',
      'organisation',
      'organisational',
      'centre',
      'recognise',
      'summarise',
      'behaviour',
      'catalogue',
      'licence',
      'modelled',
      'modelling',
      'prioritise',
      'optimise',
      'neighbour',
      'honour',
      'standardise',
      'authorise',
      'favour',
      'colour',
      'analyse',
      'utilise',
      'minimise',
      'maximise',
      'emphasise',
      'realise',
      'specialise',
      'customise',
      'categorise',
      'apologise',
      'mobilise',
      'labour',
      'travelled',
      'defence',
      'offence',
      'practise',
      'enrol',
      'fulfil',
      'instalment',
      'skilful',
      'artefact',
      'ageing',
      'whilst',
      'amongst',
      'learnt',
      'sceptical',
      'storey',
    ]) {
      expect(words(`He said ${word} here.`)).toEqual([word])
    }
  })

  test('finds inflections, whatever the case', () => {
    expect(
      words(
        'Organisations recognised the BEHAVIOURS it summarises, prioritisation and characterisation.'
      )
    ).toEqual([
      'Organisations',
      'recognised',
      'BEHAVIOURS',
      'summarises',
      'prioritisation',
      'characterisation',
    ])
  })

  test('gives the American spelling in the word’s own case', () => {
    const [organisation, programme, behaviour] = findBritishSpellings(
      'Organisation, PROGRAMME, behavioural'
    )
    expect(organisation.american).toBe('Organization')
    expect(programme.american).toBe('PROGRAM')
    expect(behaviour.american).toBe('behavioral')
    expect(findBritishSpellings('the centred group')[0].american).toBe(
      'centered'
    )
  })

  test('finds a word with a common prefix, a hyphen or a possessive', () => {
    expect(
      words(
        "reorganisation, deprioritised, unrecognised, the help-centre, the organisation's"
      )
    ).toEqual([
      'reorganisation',
      'deprioritised',
      'unrecognised',
      'centre',
      'organisation',
    ])
    expect(findBritishSpellings('reorganisation')[0].american).toBe(
      'reorganization'
    )
  })

  test('finds a word inside Markdown emphasis', () => {
    expect(words('**programme** and _catalogue_')).toEqual([
      'programme',
      'catalogue',
    ])
  })

  test('reads whole words only', () => {
    // An identifier joined to another word, and words that merely contain a
    // listed form, are not spellings.
    expect(
      words('sanitiseText summariseInput aftermaths decentre2 programmer')
    ).toEqual([])
  })

  test('leaves words American usage accepts', () => {
    expect(
      words(
        'towards, judgement, cancelled, acknowledgement, grey, practice, practices, license, licensed, analyses, analysis, enrollment, enrolled, program, programmed, emphasis, emphases'
      )
    ).toEqual([])
  })

  test('skips URLs, email addresses and link targets', () => {
    expect(
      words(
        'See https://example.co.uk/programme-centre, www.example.org/organisation, mail programme@example.com, or [the page](./centre.md).'
      )
    ).toEqual([])
  })

  test('skips inline code and fenced blocks', () => {
    const fence = '```'
    expect(
      words(
        `Run \`optimise --colour\` and \`\`organisation\`\`.\n\n${fence}ts\nconst centre = colour\n${fence}\n\nAfter the fence.`
      )
    ).toEqual([])
    expect(
      words(`${fence}\nunclosed centre\nstill code: organisation`)
    ).toEqual([])
    // The fence ends, and prose after it is read again.
    expect(words(`${fence}\ncentre\n${fence}\nThe programme.`)).toEqual([
      'programme',
    ])
  })

  test('skips a kept phrase, and only that phrase', () => {
    const kept = ['Royal Centre for Testing']
    expect(words('The Royal Centre for Testing ran the centre.', kept)).toEqual(
      ['centre']
    )
  })

  test('reports where each word is', () => {
    const text = 'one\ntwo programme'
    const [hit] = findBritishSpellings(text)
    expect(text.slice(hit.index, hit.index + hit.word.length)).toBe('programme')
    expect(hit.excerpt).toBe('one two programme')
  })
})

describe('BRITISH_SPELLINGS', () => {
  test('never lists a spelling American usage accepts', () => {
    for (const accepted of [
      'towards',
      'judgement',
      'cancelled',
      'acknowledgement',
      'grey',
      'analyses',
      'practice',
      'license',
    ]) {
      expect(BRITISH_SPELLINGS.has(accepted)).toBe(false)
    }
  })

  test('maps every form to a different, unlisted spelling', () => {
    for (const [british, american] of BRITISH_SPELLINGS) {
      expect(british).toBe(british.toLowerCase())
      expect(american).not.toBe(british)
      expect(BRITISH_SPELLINGS.has(american)).toBe(false)
    }
  })
})
