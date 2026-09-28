/**
 * The British spellings that nothing a visitor or the model reads may use.
 *
 * The rule is Matt's (2026-09-28, MTC-94): he is US based, so the site's
 * copy, the corpus, the policy and the eval rubrics are written in American
 * English. The model copies the spelling of what it reads, and the progress
 * rows show corpus headings verbatim, so a British form in a document
 * reaches the visitor before an answer does. The source guard in
 * lib/site-copy.test.ts reads this one definition.
 *
 * The list is Matt's to extend. It holds clear-cut British forms only.
 * Words American usage also accepts are left out on purpose: towards,
 * judgement, cancelled, acknowledgement, grey. So is "analyses", which is
 * also the American plural of "analysis", and "practice" and "license",
 * which are correct American nouns.
 *
 * Matching is by whole word and ignores case, so "Organisation's" and
 * "help-centre" are found and an identifier such as `sanitiseText` is not.
 * A word may carry one common prefix ("reorganise", "unrecognised"). URLs,
 * email addresses, Markdown link targets and code (a fenced block or an
 * inline span in backticks) are skipped, so a link to a British site or a
 * quoted identifier never fails the build. A proper noun or a quotation
 * that must keep its British spelling goes in KEPT_AS_WRITTEN, verbatim.
 */

/**
 * Stems of the verbs British English spells -ise (and their -isation,
 * -iser, -isable forms), which American English spells -ize.
 */
const ISE_STEMS = [
  'apolog',
  'author',
  'capital',
  'catastroph',
  'categor',
  'central',
  'character',
  'critic',
  'custom',
  'emphas',
  'final',
  'formal',
  'general',
  'initial',
  'italic',
  'local',
  'maxim',
  'memo',
  'minim',
  'mobil',
  'modern',
  'neutral',
  'normal',
  'optim',
  'organ',
  'personal',
  'priorit',
  'production',
  'real',
  'recogn',
  'sanit',
  'serial',
  'special',
  'stabil',
  'standard',
  'summar',
  'synchron',
  'token',
  'util',
  'visual',
] as const

const ISE_ENDINGS = [
  'e',
  'ed',
  'es',
  'ing',
  'ation',
  'ations',
  'ational',
  'ationally',
  'er',
  'ers',
  'able',
] as const

/**
 * Stems of the verbs British English spells -yse. "analyses" is left out:
 * it is also the plural of "analysis".
 */
const YSE_STEMS = ['anal', 'catal', 'paral'] as const
const YSE_ENDINGS = ['e', 'ed', 'ing', 'er', 'ers'] as const

/** Words British English spells -our where American English has -or. */
const OUR_WORDS = [
  'behaviour',
  'colour',
  'favour',
  'honour',
  'labour',
  'neighbour',
] as const

const OUR_ENDINGS = [
  '',
  's',
  'ed',
  'ing',
  'al',
  'ally',
  'able',
  'ably',
  'ite',
  'ites',
  'ful',
  'less',
  'hood',
  'hoods',
  'er',
  'ers',
] as const

/** Every other listed form, with its American spelling. */
const WORD_PAIRS: readonly (readonly [british: string, american: string])[] = [
  ['ageing', 'aging'],
  ['amongst', 'among'],
  ['artefact', 'artifact'],
  ['artefacts', 'artifacts'],
  ['catalogue', 'catalog'],
  ['catalogued', 'cataloged'],
  ['catalogues', 'catalogs'],
  ['cataloguing', 'cataloging'],
  ['centre', 'center'],
  ['centred', 'centered'],
  ['centrepiece', 'centerpiece'],
  ['centrepieces', 'centerpieces'],
  ['centres', 'centers'],
  ['centring', 'centering'],
  ['defence', 'defense'],
  ['defences', 'defenses'],
  ['enrol', 'enroll'],
  ['enrolment', 'enrollment'],
  ['enrolments', 'enrollments'],
  ['enrols', 'enrolls'],
  ['fulfil', 'fulfill'],
  ['fulfilment', 'fulfillment'],
  ['fulfils', 'fulfills'],
  ['instalment', 'installment'],
  ['instalments', 'installments'],
  ['labelled', 'labeled'],
  ['labelling', 'labeling'],
  ['learnt', 'learned'],
  ['licence', 'license'],
  ['licences', 'licenses'],
  ['maths', 'math'],
  ['modelled', 'modeled'],
  ['modeller', 'modeler'],
  ['modellers', 'modelers'],
  ['modelling', 'modeling'],
  ['offence', 'offense'],
  ['offences', 'offenses'],
  ['practise', 'practice'],
  ['practised', 'practiced'],
  ['practises', 'practices'],
  ['practising', 'practicing'],
  ['programme', 'program'],
  ['programmes', 'programs'],
  ['sceptic', 'skeptic'],
  ['sceptical', 'skeptical'],
  ['sceptically', 'skeptically'],
  ['scepticism', 'skepticism'],
  ['sceptics', 'skeptics'],
  ['skilful', 'skillful'],
  ['skilfully', 'skillfully'],
  ['storey', 'story'],
  ['storeys', 'stories'],
  ['travelled', 'traveled'],
  ['traveller', 'traveler'],
  ['travellers', 'travelers'],
  ['travelling', 'traveling'],
  ['whilst', 'while'],
]

/**
 * Prefixes a listed word may carry and still be found: "reorganise",
 * "deprioritisation", "unrecognised", "dishonour".
 */
const PREFIXES = ['co', 'de', 'dis', 'mis', 'non', 'over', 're', 'un', 'under']

/**
 * Proper nouns and quotations that keep their British spelling, written
 * exactly as they appear. Each entry is Matt's decision; add one only with
 * his word, and say where it appears.
 */
export const KEPT_AS_WRITTEN: readonly string[] = [
  // Quotations, kept as the corpus quotes them until Matt says whether a
  // quotation takes American spelling (MTC-94).
  // content/knowledge/career/ai-email-engagement-summary.md, quoting the plan.
  '"productionise, even if that means a rewrite"',
  // content/knowledge/career/symphony-autonomous-security-remediation.md,
  // quoting Matt.
  'prescribing things for the entire organisation',
]

/** Every listed British form, lowercase, with its American spelling. */
export const BRITISH_SPELLINGS: ReadonlyMap<string, string> = new Map([
  ...ISE_STEMS.flatMap(stem =>
    ISE_ENDINGS.map(
      ending => [`${stem}is${ending}`, `${stem}iz${ending}`] as const
    )
  ),
  ...YSE_STEMS.flatMap(stem =>
    YSE_ENDINGS.map(
      ending => [`${stem}ys${ending}`, `${stem}yz${ending}`] as const
    )
  ),
  ...OUR_WORDS.flatMap(word =>
    OUR_ENDINGS.map(
      ending => [`${word}${ending}`, `${word.slice(0, -2)}r${ending}`] as const
    )
  ),
  ...WORD_PAIRS,
])

/**
 * A word: a run of letters and digits. A hyphen, an apostrophe or Markdown
 * emphasis ends one, so "help-centre" and "organisation's" are read as
 * "centre" and "organisation".
 */
const WORD = /[\p{L}\p{M}\p{N}]+/gu

/**
 * Text that is not prose, so its spelling is not ours to choose. Code comes
 * first so a URL inside a code span is masked with the span.
 */
const NOT_PROSE = [
  // A fenced code block, to its closing fence or the end of the text.
  /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm,
  // An inline code span on one line, with one or two backticks.
  /``[^\n]*?``|`[^`\n]+`/g,
  // A URL, with or without its scheme.
  /\b(?:https?|ftp|file):\/\/[^\s<>"'`)\]]+|\bwww\.[^\s<>"'`)\]]+/gi,
  // A Markdown link target, which may be a relative path.
  /\]\([^)\s]*\)/g,
  // An email address.
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
]

/** One British spelling found in a text. */
export interface BritishSpellingHit {
  index: number
  word: string
  american: string
  excerpt: string
}

/**
 * The text with every span that is not prose, and every kept phrase,
 * replaced by spaces. Line breaks and length are kept, so an index into the
 * result is an index into the text.
 */
function maskNotProse(text: string, kept: readonly string[]): string {
  const blank = (span: string) => span.replace(/[^\n]/g, ' ')
  let masked = text
  for (const pattern of NOT_PROSE) masked = masked.replace(pattern, blank)
  for (const phrase of kept) masked = masked.split(phrase).join(blank(phrase))
  return masked
}

/**
 * The American spelling of a word, in the word's own case, when the word is
 * a listed British form, alone or after one listed prefix.
 */
function americanFor(word: string): string | undefined {
  const lower = word.toLowerCase()
  const prefix = BRITISH_SPELLINGS.has(lower)
    ? ''
    : PREFIXES.find(
        candidate =>
          lower.startsWith(candidate) &&
          BRITISH_SPELLINGS.has(lower.slice(candidate.length))
      )
  if (prefix === undefined) return undefined
  const american = prefix + BRITISH_SPELLINGS.get(lower.slice(prefix.length))
  if (word.length > 1 && word === word.toUpperCase()) {
    return american.toUpperCase()
  }
  if (word[0] === word[0].toUpperCase()) {
    return american[0].toUpperCase() + american.slice(1)
  }
  return american
}

/**
 * Every listed British spelling in the text, outside code, URLs and the
 * kept phrases.
 */
export function findBritishSpellings(
  text: string,
  kept: readonly string[] = KEPT_AS_WRITTEN
): BritishSpellingHit[] {
  const masked = maskNotProse(text, kept)
  return [...masked.matchAll(WORD)].flatMap(match => {
    const word = match[0]
    const american = americanFor(word)
    if (american === undefined) return []
    const excerpt = text
      .slice(Math.max(0, match.index - 30), match.index + word.length + 30)
      .replace(/\s+/g, ' ')
      .trim()
    return [{ index: match.index, word, american, excerpt }]
  })
}
