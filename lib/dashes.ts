/**
 * The dashes that nothing a visitor reads may use as punctuation.
 *
 * The rule is Matt's: the site carries no em dash. Two places enforce it and
 * both read this one definition, so they cannot disagree about what a dash
 * is: the source guard in lib/site-copy.test.ts, and the eval assertion
 * `assertNoEmDash` that reads the assistant's answers.
 *
 * "Em dash" means the characters that render as one, not only U+2014: the
 * horizontal bar, the two- and three-em dashes, and the small and vertical
 * presentation forms all read as the same mark on a page. HTML entities for
 * them count too, because markdown and JSX both render an entity as the
 * character it names.
 *
 * The en dash is narrower. It is the correct mark in a range, and the
 * résumé's dates ("Jul 2017 – present") are written with one, so it is a
 * punctuation dash only when it stands between spaces and the words on
 * either side are not the two ends of a range.
 */

/** U+2014, U+2015, U+2E3A, U+2E3B, U+FE31, U+FE58. */
const EM_DASH_CHARACTERS = '\u2014\u2015\u2E3A\u2E3B\uFE31\uFE58'

/** U+2013 and the marks that render like it: figure dash, vertical en dash. */
const EN_DASH_CHARACTERS = '\u2013\u2012\uFE32'

const EM_DASH = new RegExp(`[${EM_DASH_CHARACTERS}]`, 'g')

/**
 * An en dash with whitespace, or the edge of a line, on both sides. The
 * lookarounds keep the surrounding spaces out of the match so two dashes a
 * space apart are both found.
 */
const SPACED_EN_DASH = new RegExp(
  `(?<=^|\\s)[${EN_DASH_CHARACTERS}](?=\\s|$)`,
  'gm'
)

const NAMED_DASH_ENTITIES: Record<string, string> = {
  mdash: '\u2014',
  horbar: '\u2015',
  ndash: '\u2013',
}

const DASH_ENTITY =
  /&(?:(mdash|horbar|ndash)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}));/g

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b\\.?'

/** The left end of a range: a number or a month, then the space before the dash. */
const RANGE_START = new RegExp(`(?:\\d|\\b${MONTH})\\s+$`, 'i')

/** The right end of a range: the space after the dash, then a number, a month, or an open end. */
const RANGE_END = new RegExp(
  `^\\s+(?:\\d|(?:present|now|today)\\b|${MONTH})`,
  'i'
)

/** One dash found in a text, with a little of the text around it. */
export interface DashHit {
  index: number
  excerpt: string
}

/**
 * The text with every dash entity replaced by the character it names, so
 * `&mdash;` and `&#8212;` are found the way the rendered page shows them.
 * Entities for anything else are left as written.
 */
export function decodeDashEntities(text: string): string {
  return text.replace(
    DASH_ENTITY,
    (entity, name?: string, decimal?: string, hex?: string) => {
      if (name !== undefined) return NAMED_DASH_ENTITIES[name]
      const codePoint =
        decimal !== undefined ? Number(decimal) : Number.parseInt(hex ?? '', 16)
      const character = String.fromCodePoint(Math.min(codePoint, 0x10ffff))
      return EM_DASH_CHARACTERS.includes(character) ||
        EN_DASH_CHARACTERS.includes(character)
        ? character
        : entity
    }
  )
}

/** Every em dash in the text, entities included. */
export function findEmDashes(text: string): DashHit[] {
  const decoded = decodeDashEntities(text)
  return [...decoded.matchAll(EM_DASH)].map(match =>
    hitAt(decoded, match.index)
  )
}

/**
 * Every dash used as punctuation: each em dash, and each en dash that stands
 * between spaces without being a range.
 */
export function findPunctuationDashes(text: string): DashHit[] {
  const decoded = decodeDashEntities(text)
  const emDashes = [...decoded.matchAll(EM_DASH)].map(match => match.index)
  const spacedEnDashes = [...decoded.matchAll(SPACED_EN_DASH)]
    .map(match => match.index)
    .filter(index => !isRange(decoded, index))
  return [...emDashes, ...spacedEnDashes]
    .sort((a, b) => a - b)
    .map(index => hitAt(decoded, index))
}

function isRange(text: string, index: number): boolean {
  return (
    RANGE_START.test(text.slice(0, index)) &&
    RANGE_END.test(text.slice(index + 1))
  )
}

function hitAt(text: string, index: number): DashHit {
  const excerpt = text
    .slice(Math.max(0, index - 30), index + 31)
    .replace(/\s+/g, ' ')
    .trim()
  return { index, excerpt }
}
