import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openSourceRepos } from '@/content/open-source'
import { MAX_TITLE_CHARS } from '@/lib/chat/progress'
import {
  buildKnowledgeCorpus,
  estimateTokens,
  findPlaceholder,
  KNOWLEDGE_DIR,
  KNOWLEDGE_DOCUMENT_TOKEN_CEILING,
  KNOWLEDGE_INDEX_TOKEN_CEILING,
  sourceLines,
  SUMMARY_MAX_LENGTH,
} from './build'
import { KNOWLEDGE_READ_BUDGET } from './index'

/**
 * The mechanical guard on what the career assistant is allowed to read.
 *
 * content/knowledge is the assistant's only source, and it is written for
 * the public. The corpus has two surfaces now — the index, which is in
 * every prompt, and the documents, which the model fetches one at a time —
 * and a leak in either is a leak. So every content guard below runs over
 * the same list: the rendered index text, plus each document's body as the
 * build produces it. Asserting against the built output rather than the
 * files means a leak cannot slip in through a summary, the ordering, or
 * anything else the build assembles.
 *
 * scripts/knowledge-denylist-check.sh is the second half of the guard: it
 * greps the files against a private denylist that only exists on Matt's
 * machine. This file holds everything that can live in the repo.
 */

const corpus = buildKnowledgeCorpus()
const index = corpus.index

/** Everything the model can ever see, each piece named for the failure. */
const surfaces: readonly { label: string; text: string }[] = [
  { label: 'the index', text: index.text },
  ...corpus.documents.map(document => ({
    label: `${document.topic}/${document.id}`,
    text: document.text,
  })),
]

/** The whole corpus as one string, for guards that only need containment. */
const everything = surfaces.map(surface => surface.text).join('\n\n')

/**
 * Characters that are invisible in an editor but split a word for any
 * regex: soft hyphen, zero-width space/non-joiner/joiner, word joiner and
 * a stray BOM. A soft hyphen in the middle of "runway" reads as one
 * word to a person and to a model, and as two to /\brunway\b/.
 */
// Every Unicode format character (zero-width and bidi controls, joiners,
// BOM) plus the soft hyphen and two combining/space oddities NFKC leaves
// alone. A category beats a hand list: the next invisible codepoint is
// covered by construction.
const INVISIBLE = /[\p{Cf}\u00AD\u034F\u180E]/gu

/** Matt's own site: the one host whose URLs are his words, not a citation. */
const OWN_HOST = /^https?:\/\/(?:www\.)?matttrifilo\.com(?=[/?#]|$)/i

/**
 * Unpacks an own-domain URL into the words inside it, so a phrase hidden
 * in a path or query string is still scanned. A third-party URL is dropped
 * instead: its slug is someone else's copy, and news URLs routinely carry
 * guard words ("...block-layoffs-ai-mandates...") and digit runs that look
 * like phone numbers while saying nothing about Matt.
 */
function unpackUrl(url: string): string {
  if (!OWN_HOST.test(url)) return ''
  return ` ${url.replace(/^https?:\/\//, '').replace(/[/._~?#&=+-]+/g, ' ')} `
}

/**
 * The view the word-shaped guards run against: invisible characters
 * removed, compatibility-normalised so look-alike glyphs cannot smuggle a
 * word past a regex, and URLs resolved by unpackUrl above.
 *
 * Guards about leaked contact details and placeholders (email addresses,
 * amounts, TODO) still run against the full built text, where nothing is
 * removed at all.
 */
function prose(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\]\(([^)]*)\)/g, (_m, url: string) => `]${unpackUrl(url)}`)
    .replace(/https?:\/\/\S+/g, url => unpackUrl(url))
}

/**
 * Exact strings that already appear, in public, on matttrifilo.com and
 * have been read and accepted. They are removed before the word-shaped
 * guards run.
 *
 * Adding an entry is a deliberate, reviewable act: it must be a literal
 * phrase, and the comment must say which published page it comes from and
 * why it is not what the guard is looking for. Never add a bare guard word
 * here — that would disable the guard everywhere.
 */
const REVIEWED_PUBLIC_PHRASES: readonly string[] = [
  // blog/from-typing-code-to-agent-factories: startup runway, about AI
  // companies raising money, not about anyone's personal finances.
  'run out of runway',
  'the runway to afford',
  // blog/from-typing-code-to-agent-factories: a model name that happens to
  // have the shape of an issue key.
  'GPT-5.3',
]

function withoutReviewedPhrases(text: string): string {
  return REVIEWED_PUBLIC_PHRASES.reduce(
    (acc, phrase) => acc.split(phrase).join(''),
    text
  )
}

/** Each surface as the word-shaped guards see it. */
const proseSurfaces = surfaces.map(surface => ({
  label: surface.label,
  text: withoutReviewedPhrases(prose(surface.text)),
}))

/**
 * Topics that are out of bounds for a public career assistant: employment
 * actions, money, and the private planning documents this repo must never
 * read. Matched case-insensitively, on whole words.
 */
const FORBIDDEN_WORDS: readonly string[] = [
  'layoff',
  'layoffs',
  'RIF',
  'severance',
  'salary',
  'compensation',
  'comp band',
  'HELOC',
  'mortgage',
  'runway',
  'PIP',
  'succession',
  'CDP',
  'KumoMTA',
]

const PUBLIC_CONTACT = 'matt.trifilo@gmail.com'

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whole-word, case-insensitive containment for a term that may contain
 * regex metacharacters and may not begin or end with a word character.
 *
 * `\b` is defined against `\w`, so it silently does the wrong thing at a
 * punctuated edge: `\b401(k)\b` never matches (and would throw as an
 * unescaped pattern), and `\bC++\b` is a syntax error. Escaping the term
 * and bounding it with `(?<![\w-])`/`(?![\w-])` instead means the boundary
 * is "not in the middle of another word", which is what the guard means.
 * Hyphens count as part of a word here, which is why unpackUrl splits an
 * own-domain slug on them: "…/no-runway-left" is scanned as three words,
 * not skipped as one.
 */
function containsWord(text: string, term: string): boolean {
  // Plain \w boundaries: a hyphenated compound like "post-layoff" must
  // still fire, and own-domain slugs are split on '-' by unpackUrl anyway.
  return new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`, 'i').test(text)
}

/** Reports the surface that failed, not just that something did. */
function offenders(
  list: readonly { label: string; text: string }[],
  fails: (text: string) => boolean
): string[] {
  return list.filter(surface => fails(surface.text)).map(s => s.label)
}

describe('knowledge corpus content guards', () => {
  test('positive control: the guards are running against real text', () => {
    // If the build ever returned empty text, every "not to match"
    // assertion below would pass for the wrong reason.
    expect(surfaces.length).toBeGreaterThan(1)
    expect(everything.length).toBeGreaterThan(10_000)
    expect(everything).toContain('Matt Trifilo')
    expect(index.text).toContain('## resume')
    expect(index.text).toContain('[resume]')
    expect(proseSurfaces.map(s => s.text).join('').length).toBeGreaterThan(
      10_000
    )
  })

  test('no surface contains a phone number', () => {
    expect(
      offenders(
        proseSurfaces,
        text =>
          /\d{3}[-. ()]*\d{3}[-. ()]*\d{4}/.test(text) ||
          /\+1[\s-]?\d/.test(text)
      )
    ).toEqual([])
  })

  test('the only email address in the corpus is the public contact', () => {
    const addresses = [
      ...new Set(everything.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []),
    ]
    expect(addresses).toEqual([PUBLIC_CONTACT])
  })

  test('no surface contains a dollar amount', () => {
    expect(offenders(surfaces, text => /\$\s*[\d.,]/.test(text))).toEqual([])
  })

  test('no surface contains an issue-tracker key', () => {
    const keys = [
      ...new Set(
        proseSurfaces.flatMap(s => s.text.match(/\b[A-Z]{2,5}-\d+\b/g) ?? [])
      ),
    ]
    expect(keys).toEqual([])
  })

  test('no surface contains a forbidden word', () => {
    const hits: string[] = []
    for (const surface of proseSurfaces) {
      for (const word of FORBIDDEN_WORDS) {
        if (containsWord(surface.text, word)) hits.push(surface.label)
      }
    }
    expect(hits).toEqual([])
  })

  test('the word matcher handles punctuated and metacharacter terms', () => {
    // A term like "401(k)" or "C++" is exactly the kind a future denylist
    // entry would use; `\b…\b` fails open on the first and throws on the
    // second, so the guard would go quiet without anyone noticing.
    expect(containsWord('his 401(k) is vested', '401(k)')).toBe(true)
    expect(containsWord('they use C++ here', 'C++')).toBe(true)
    expect(containsWord('comp band review', 'comp band')).toBe(true)
    expect(containsWord('SALARY band', 'salary')).toBe(true)
    // …and does not fire inside a longer word.
    expect(containsWord('the runwayside cafe', 'runway')).toBe(false)
    expect(containsWord('401(k)s everywhere', '401(k)')).toBe(false)
    // …but a hyphenated compound is still the word.
    expect(containsWord('post-layoff planning', 'layoff')).toBe(true)
    expect(containsWord('the salary-band review', 'salary')).toBe(true)
  })

  test('no surface contains a TODO placeholder', () => {
    // The backstop for the build-time refusal, run over the text as it
    // actually ships — which is the only place it can catch the faq, whose
    // placeholders are dropped rather than refused.
    //
    // It looks for a placeholder's shape, not the word: findPlaceholder is
    // the same function the build uses, so a document that passes the build
    // cannot fail here for a reason the author was never told about. A
    // career document is allowed to discuss TODO comments in code.
    expect(
      offenders(surfaces, text => findPlaceholder(sourceLines(text)) !== null)
    ).toEqual([])
  })

  test('the placeholder matcher finds placeholders, not the word', () => {
    const placeholder = (body: string) =>
      findPlaceholder(sourceLines(body)) !== null
    // Shapes that are placeholders.
    expect(placeholder('TODO (Matt)')).toBe(true)
    expect(placeholder('TODO: write this up')).toBe(true)
    expect(placeholder('- TODO (Matt)')).toBe(true)
    expect(placeholder('1. TODO')).toBe(true)
    expect(placeholder('# A doc\n\n## A section\n\n  TODO (Matt)')).toBe(true)
    // Prose that is not. Matt's career documents describe how his team
    // works; rejecting the bare word would make that unpublishable.
    expect(placeholder('The agent leaves a TODO for the reviewer.')).toBe(false)
    expect(placeholder('We grep for `TODO` before every release.')).toBe(false)
    expect(placeholder('```sh\n# TODO: fix this\n```')).toBe(false)
    // …and an escaped backtick does not make a code span, so the
    // placeholder inside one is still a placeholder.
    expect(placeholder('\\`TODO (Matt)\\`')).toBe(true)
  })

  test('no surface contains a comment marker, closed or unterminated', () => {
    // stripComments removes closed comments; an unterminated `<!--` would
    // otherwise ship verbatim with everything after it.
    expect(
      offenders(surfaces, t => t.includes('<!--') || t.includes('-->'))
    ).toEqual([])
  })

  test('the prose view unpacks own URLs and drops third-party ones', () => {
    // Words hidden in a matttrifilo.com path must still be scanned; a
    // citation to someone else's page must not be.
    const own = prose('see [post](https://matttrifilo.com/blog/my-severance)')
    expect(containsWord(own, 'severance')).toBe(true)
    const theirs = prose('see [news](https://example.com/block-layoffs-2026)')
    expect(containsWord(theirs, 'layoffs')).toBe(false)
    // …and an invisible character in the middle of a word does not hide it.
    expect(containsWord(prose('sal\u200Bary band'), 'salary')).toBe(true)
    expect(containsWord(prose('\uFF53alary band'), 'salary')).toBe(true)
  })

  test('no surface contains invisible characters that would defeat the guards', () => {
    // A soft hyphen or zero-width space inside a guard word is invisible to
    // a reader and to the model, and splits the word for every regex above.
    // prose() strips them before matching; this asserts they are not in the
    // published text at all, so the stripping is a backstop and not the
    // only thing standing between a hidden word and the prompt.
    const found = [...new Set(everything.match(INVISIBLE) ?? [])].map(
      c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
    )
    expect(found).toEqual([])
  })

  test('drops the unanswered FAQ questions entirely', () => {
    // faq/faq.md ships eight questions with `TODO (Matt)` bodies. Until
    // Matt answers one, the document must not exist at all — not exist and
    // be empty, and certainly not carry the placeholders into the index.
    const faqSource = fs.readFileSync(
      path.join(KNOWLEDGE_DIR, 'faq', 'faq.md'),
      'utf8'
    )
    expect(faqSource).toContain('TODO (Matt)')
    expect(corpus.documents.map(d => d.id)).not.toContain('faq')
    expect(index.text).not.toContain('[faq]')
    expect(everything).not.toContain("What does Matt's team own?")
  })
})

describe('knowledge corpus structure', () => {
  /** Every `.md` under content/knowledge, with the topic it sits in. */
  function filesOnDisk(): { topic: string; name: string; path: string }[] {
    return fs
      .readdirSync(KNOWLEDGE_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .flatMap(entry =>
        fs
          .readdirSync(path.join(KNOWLEDGE_DIR, entry.name))
          .filter(name => name.endsWith('.md'))
          .map(name => ({
            topic: entry.name,
            name,
            path: path.join(KNOWLEDGE_DIR, entry.name, name),
          }))
      )
  }

  test('every document lives in a topic directory, never loose', () => {
    const loose = fs
      .readdirSync(KNOWLEDGE_DIR, { withFileTypes: true })
      .filter(entry => !entry.isDirectory() && entry.name.endsWith('.md'))
      .map(entry => entry.name)
    expect(loose).toEqual([])
    expect(filesOnDisk().length).toBeGreaterThan(0)
  })

  test('every file carries the full frontmatter contract', () => {
    for (const file of filesOnDisk()) {
      const label = `${file.topic}/${file.name}`
      const contents = fs.readFileSync(file.path, 'utf8')
      const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/.exec(
        contents
      )
      expect(match, `${label} has no frontmatter block`).not.toBeNull()
      const frontmatter = match![1]
      for (const key of ['id', 'title', 'summary', 'tags', 'updated']) {
        expect(frontmatter, `${label} is missing ${key}`).toMatch(
          new RegExp(`^${key}:[ \\t]*\\S`, 'm')
        )
      }
      // `source` is the topic directory, never a declaration: two fields
      // with the same five values and nothing asserting they agreed is how
      // a career document gets to call itself the résumé.
      expect(frontmatter, `${label} must not declare source`).not.toMatch(
        /^source:/m
      )
      // The build enforces id === basename, so the id the model cites names
      // the file on disk; assert it here too so the reason is visible where
      // the contract is described.
      expect(frontmatter, `${label}: id must equal the file name`).toMatch(
        new RegExp(
          `^id:[ \\t]*['"]?${file.name.replace(/\.md$/, '')}['"]?[ \\t]*$`,
          'm'
        )
      )
    }
  })

  test('every summary is one short sentence a reader could skim', () => {
    for (const document of corpus.documents) {
      expect(
        document.summary.length,
        `${document.id} summary`
      ).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH)
      expect(document.summary.trim(), `${document.id} summary`).not.toBe('')
      expect(document.summary, `${document.id} summary`).not.toContain('\n')
    }
  })

  test('every document has tags and a topic that is its directory', () => {
    for (const document of corpus.documents) {
      expect(document.tags.length, `${document.id} tags`).toBeGreaterThan(0)
      const onDisk = filesOnDisk().find(
        file => file.name === `${document.id}.md`
      )
      expect(onDisk, `${document.id} has no file`).toBeDefined()
      expect(document.topic).toBe(onDisk!.topic)
    }
  })

  test('ids are unique, and a canonical is an absolute URL', () => {
    const ids = corpus.documents.map(d => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const document of corpus.documents) {
      if (document.canonical !== undefined) {
        expect(document.canonical.startsWith('https://')).toBe(true)
      }
    }
  })

  test('the index renders one line per document, grouped by topic', () => {
    const lines = index.text.split('\n').filter(line => line.startsWith('- '))
    expect(lines.length).toBe(index.entries.length)
    for (const entry of index.entries) {
      expect(index.text).toContain(
        `- [${entry.id}] ${entry.title} — ${entry.summary} (tags: ${entry.tags.join(', ')}; ~${entry.tokenEstimate} tokens)`
      )
    }
    // Topic headings come before the entries they group, and each topic
    // appears once: that is what "grouped" has to mean for the model.
    const topics = index.text
      .split('\n')
      .filter(line => line.startsWith('## '))
      .map(line => line.slice(3))
    expect(new Set(topics).size).toBe(topics.length)
    expect(topics).toEqual([...new Set(index.entries.map(e => e.topic))])
  })

  test('the index carries no document body', () => {
    // The index is a menu, not the meal. "Menu" is a claim about the index
    // against the corpus as a whole, not against any one document: the index
    // grows a line per document while the shortest document does not grow at
    // all, so comparing the two crosses over on corpus size alone and says
    // nothing about whether a body leaked into a summary.
    const bodyTotal = corpus.documents.reduce(
      (sum, document) => sum + document.text.length,
      0
    )
    expect(index.text.length).toBeLessThan(bodyTotal / 4)

    // What the per-document form was really protecting: one entry may not
    // carry more than its own catalogue line. An entry is the summary plus
    // the id, title, tags and token estimate around it, so bound it by the
    // summary rule the frontmatter contract already enforces plus room for
    // that scaffolding.
    const longestEntryLine = Math.max(
      ...index.text
        .split('\n')
        .filter(line => line.startsWith('- '))
        .map(line => line.length)
    )
    expect(longestEntryLine).toBeLessThan(SUMMARY_MAX_LENGTH * 3)

    expect(index.tokenEstimate).toBeLessThan(KNOWLEDGE_INDEX_TOKEN_CEILING)
  })
})

/**
 * What to do when a post has no knowledge twin. scripts/new-blog-post.ts
 * writes both files, so this only fires for a post added by hand — and
 * then the fix is a copy-paste rather than a hunt through the loader.
 */
function missingTwinMessage(slug: string): string {
  return [
    `content/blog/${slug}.md has no content/knowledge/blog/${slug}.md.`,
    'Create it with this frontmatter, then paste the post body below it',
    "with the post's own frontmatter removed:",
    '',
    '---',
    `id: '${slug}'`,
    "title: '<the post title, on one line>'",
    "summary: '<one sentence, what a reader would learn>'",
    'tags: [blog, <a topic or two>]',
    "updated: '<the post date, YYYY-MM-DD>'",
    `canonical: 'https://matttrifilo.com/blog/${slug}'`,
    '---',
  ].join('\n')
}

describe('knowledge corpus stays in sync with its public sources', () => {
  const documentText = (id: string) => {
    const document = corpus.documents.find(d => d.id === id)
    expect(document, `no document ${id}`).toBeDefined()
    return document!.text
  }

  test('the résumé document is the published résumé, verbatim', () => {
    // content/resume.md is regenerated by scripts/render-resume.sh from a
    // private source. Without this, a regeneration would quietly leave the
    // assistant answering from a stale résumé.
    const published = fs.readFileSync(
      path.join(process.cwd(), 'content', 'resume.md'),
      'utf8'
    )
    expect(documentText('resume')).toBe(published.trim())
  })

  test('every blog post has a document carrying the published body', () => {
    const blogDir = path.join(process.cwd(), 'content', 'blog')
    const slugs = fs
      .readdirSync(blogDir)
      .filter(name => name.endsWith('.md') && !name.startsWith('_'))
      .map(name => name.replace(/\.md$/, ''))
    expect(slugs.length).toBeGreaterThan(0)

    for (const slug of slugs) {
      const post = fs.readFileSync(path.join(blogDir, `${slug}.md`), 'utf8')
      const body = post.replace(
        /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/,
        ''
      )
      const document = corpus.documents.find(d => d.id === slug)
      expect(document, missingTwinMessage(slug)).toBeDefined()
      expect(document!.topic).toBe('blog')
      expect(document!.source).toBe('blog')
      // The post it was copied from is the canonical one.
      expect(document!.canonical).toBe(`https://matttrifilo.com/blog/${slug}`)
      expect(document!.text).toBe(body.trim())
      // Frontmatter stripped: the post's own YAML must not be in the text.
      expect(document!.text).not.toContain('description:')
    }
  })

  test('every curated open-source project is described', () => {
    // content/open-source.ts is the reviewed list the /open-source page
    // renders; adding a project there without describing it here would
    // leave the assistant unaware of work the site already shows.
    const text = documentText('open-source')
    const flat = text.replace(/\s+/g, ' ').toLowerCase()
    for (const repo of openSourceRepos) {
      expect(text).toContain(`## ${repo.name}`)
      expect(text).toContain(`https://github.com/${repo.owner}/${repo.name}`)
      if (repo.summary) {
        // The reviewed copy is re-cased and re-wrapped in the knowledge
        // file, so compare its distinctive tail with whitespace flattened.
        const tail = repo.summary
          .slice(1)
          .trim()
          .replace(/\.$/, '')
          .replace(/\s+/g, ' ')
          .toLowerCase()
        expect(flat).toContain(tail)
      }
    }
  })
})

describe('knowledge corpus build', () => {
  test('is byte-stable: two builds produce an identical index', () => {
    const again = buildKnowledgeCorpus()
    expect(again.index.text).toBe(index.text)
    expect(again.index.tokenEstimate).toBe(index.tokenEstimate)
    expect(again.index.entries).toEqual(index.entries)
    expect(again.documents).toEqual(corpus.documents)
  })

  test('token estimate is chars/4, rounded up', () => {
    expect(index.tokenEstimate).toBe(Math.ceil(index.text.length / 4))
    for (const document of corpus.documents) {
      expect(document.tokenEstimate).toBe(Math.ceil(document.text.length / 4))
    }
    expect(estimateTokens('abcde')).toBe(2)
  })

  test('the index stays under the token ceiling', () => {
    expect(index.tokenEstimate).toBeLessThanOrEqual(
      KNOWLEDGE_INDEX_TOKEN_CEILING
    )
  })

  test('throws when the index would exceed the ceiling', () => {
    // Enough documents, each with a full-length summary, to break the real
    // ceiling rather than a lowered stand-in, so the published constant is
    // what is actually under test. This is roughly the corpus size at
    // which the index stops being cheap: a useful thing to see fail.
    const summary = 'A'.repeat(SUMMARY_MAX_LENGTH)
    const files = Array.from({ length: 250 }, (_, i) => ({
      topic: 'career',
      name: `doc-${String(i).padStart(4, '0')}.md`,
      summary,
      tags: '[career, roles, dates, scope, outcomes]',
    }))
    expect(() => buildFixture(files)).toThrow(/index is too large/)
  })

  test('refuses a document whose id does not match its name', () => {
    expect(() =>
      buildFixture([{ topic: 'resume', name: 'resume.md', id: 'not-resume' }])
    ).toThrow(/must match the file name/)
  })

  test('refuses a topic directory it does not know where to order', () => {
    expect(() => buildFixture([{ topic: 'talks', name: 'a-talk.md' }])).toThrow(
      /unknown topic/
    )
  })

  test('refuses a document left loose at the top of content/knowledge', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-fixture-'))
    try {
      fs.writeFileSync(path.join(dir, 'stray.md'), 'not in a topic\n')
      expect(() => buildKnowledgeCorpus(dir)).toThrow(/topic directory/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('refuses a summary longer than one index line', () => {
    expect(() =>
      buildFixture([
        {
          topic: 'career',
          name: 'long.md',
          summary: 'A'.repeat(SUMMARY_MAX_LENGTH + 1),
        },
      ])
    ).toThrow(/keep it to 160/)
  })

  test('refuses a document with no tags', () => {
    expect(() =>
      buildFixture([{ topic: 'career', name: 'untagged.md', tags: '[]' }])
    ).toThrow(/tags may not be empty/)
  })

  test('refuses a YAML block list of tags, naming the line', () => {
    // One list form across a hundred files; the error has to say which
    // line to fix rather than "frontmatter is invalid".
    expect(() =>
      buildFixture([
        { topic: 'career', name: 'blocklist.md', tags: '\n  - career' },
      ])
    ).toThrow(/frontmatter line is not "key: value":\s+- career/)
  })

  test('refuses two documents that would answer to the same id', () => {
    expect(() =>
      buildFixture([
        { topic: 'career', name: 'twin.md' },
        { topic: 'faq', name: 'twin.md' },
      ])
    ).toThrow(/duplicate id "twin"/)
  })

  test('answering one FAQ question emits only the answer', () => {
    // The state faq.md reaches the first time Matt writes something: one
    // answer, seven placeholders, and authoring notes in the file. The
    // document must carry the answer and nothing about the build process.
    const answered = buildFixture([
      {
        topic: 'faq',
        name: 'faq.md',
        body: [
          '# FAQ',
          '',
          'Matt writes these answers himself.',
          '',
          '<!--',
          'Replace the TODO (Matt) line under a question to publish it.',
          '-->',
          '',
          "## What does Matt's team own?",
          '',
          'Email sending end to end for all Keap products.',
          '',
          '## How does he use AI coding agents?',
          '',
          'TODO (Matt)',
        ].join('\n'),
      },
    ])

    const faq = answered.documents.find(d => d.id === 'faq')
    expect(faq).toBeDefined()
    expect(faq!.text).toContain('Email sending end to end')
    expect(faq!.text).toContain("## What does Matt's team own?")
    expect(faq!.text).toContain('Matt writes these answers himself.')
    // No placeholder, no dropped question, no authoring prose.
    expect(faq!.text).not.toMatch(/\bTODO\b/)
    expect(faq!.text).not.toContain('How does he use AI coding agents?')
    expect(faq!.text).not.toContain('Replace the')
    expect(answered.index.text).not.toMatch(/\bTODO\b/)
    expect(answered.index.text).not.toContain('<!--')
    // The drop is reported, not silent: knowledge-check prints these.
    expect(answered.unanswered).toEqual([
      {
        file: path.join('content', 'knowledge', 'faq', 'faq.md'),
        heading: 'How does he use AI coding agents?',
      },
    ])
  })

  test('drops an faq whose intro is still a placeholder, and says so', () => {
    // An intro is no more publishable than a question while it says TODO,
    // and a corpus with nothing left in it fails loudly rather than
    // handing the model an empty index.
    expect(() =>
      buildFixture([{ topic: 'faq', name: 'faq.md', body: 'TODO (Matt)' }])
    ).toThrow(/nothing to read/)
  })

  test('reports an faq dropped whole rather than dropping it silently', () => {
    const built = buildFixture([
      { topic: 'career', name: 'a-role.md' },
      {
        topic: 'faq',
        name: 'faq.md',
        body: ['## One?', '', 'TODO (Matt)', '', '## Two?', '', 'TODO'].join(
          '\n'
        ),
      },
    ])
    expect(built.documents.map(d => d.id)).toEqual(['a-role'])
    expect(built.droppedDocuments).toEqual([
      path.join('content', 'knowledge', 'faq', 'faq.md'),
    ])
    expect(built.unanswered.map(q => q.heading)).toEqual(['One?', 'Two?'])
  })

  test('a TODO outside the faq is a build error, naming file and heading', () => {
    // The dangerous case: Matt pastes in an approved career document with a
    // stray placeholder, and the old rule would delete that section from
    // both the published page and the model's copy, exit 0, no output.
    expect(
      () =>
        buildFixture([
          {
            topic: 'career',
            name: 'a-role.md',
            body: ['# A role', '', '## What I owned', '', 'TODO (Matt)'].join(
              '\n'
            ),
          },
        ])
      // Line 13 of the file, not line 5 of the body: the number has to be
      // the one the author's editor shows.
    ).toThrow(/a-role\.md:13: a TODO placeholder under "What I owned"/)
  })

  test('a TODO in the introduction outside the faq is a build error too', () => {
    expect(() =>
      buildFixture([
        { topic: 'career', name: 'a-role.md', body: 'TODO (Matt)' },
      ])
    ).toThrow(/a TODO placeholder under "the introduction"/)
  })

  test('a document about TODO comments is publishable', () => {
    // The placeholder check reads a line the way MDX will, so the word in
    // prose, in a code span, and in a fenced block are all left alone.
    // Without this, a career document describing how the team works would
    // be rejected for describing it.
    const body = [
      '# How the team reviews agent output',
      '',
      'The agent leaves a TODO for the reviewer rather than guessing.',
      '',
      'We grep for `TODO` before every release.',
      '',
      '```sh',
      '# TODO: this is a comment in a snippet, not a placeholder',
      'rg TODO',
      '```',
    ].join('\n')
    const built = buildFixture([{ topic: 'career', name: 'a-role.md', body }])
    expect(built.documents[0].text).toBe(body)
  })

  test('an escaped backtick does not hide a placeholder', () => {
    // `\`TODO (Matt)\`` is not a code span — the backticks are literal
    // text — so the placeholder inside it is a real placeholder.
    expect(() =>
      buildFixture([
        { topic: 'career', name: 'a-role.md', body: '\\`TODO (Matt)\\`' },
      ])
    ).toThrow(/a TODO placeholder/)
  })

  test('an empty body outside the faq is an error, not a quiet deletion', () => {
    // Returning null here would take the document out of the index the
    // model is shown, exit 0, nothing printed: the exact failure the faq
    // scoping exists to stop.
    for (const body of ['', '   \n\n  \n', '<!-- only a note -->']) {
      expect(() =>
        buildFixture([{ topic: 'career', name: 'a-role.md', body }])
      ).toThrow(/the body is empty; only content\/knowledge\/faq drops/)
    }
  })

  test('outside the faq, the body ships exactly as written', () => {
    // Not reassembled from blocks: byte-identity with the published source
    // is then true by construction rather than by the reassembly happening
    // to round-trip. An empty section stays; nothing is quietly dropped.
    const body = ['# Title', '', '## One', '', 'Text.', '', '## Two', ''].join(
      '\n'
    )
    const built = buildFixture([{ topic: 'career', name: 'a-role.md', body }])
    expect(built.documents[0].text).toBe(body.trim())
    expect(built.documents[0].text).toContain('## Two')
  })

  test('refuses a document big enough to crowd out the other two reads', () => {
    const oversized = 'Matt led the thing. '.repeat(
      Math.ceil((KNOWLEDGE_DOCUMENT_TOKEN_CEILING * 4) / 20) + 100
    )
    expect(() =>
      buildFixture([{ topic: 'career', name: 'a-role.md', body: oversized }])
    ).toThrow(/per-document ceiling of 9000\. Split this document/)
  })

  test('every published document is inside the per-document ceiling', () => {
    // The blog essay is the one that comes close, and it is why the
    // ceiling is not maxTokens / maxDocuments. If this starts failing, the
    // answer is to split the document, not to raise the constant.
    for (const document of corpus.documents) {
      expect(
        document.tokenEstimate,
        `${document.id} is too large to read alongside two others`
      ).toBeLessThanOrEqual(KNOWLEDGE_DOCUMENT_TOKEN_CEILING)
    }
  })

  test('every title fits the progress view that shows it', () => {
    // The browser drops a step whose title is longer than MAX_TITLE_CHARS,
    // on the grounds that no index title is that long. A title that reached
    // it would vanish from the list above the answer and take a document off
    // the count, which is the same false claim in the other direction. Half
    // the cap is the tripwire: a title anywhere near it is a mistake.
    for (const document of corpus.documents) {
      expect(
        document.title.length,
        `${document.id}: title is too long to disclose above an answer`
      ).toBeLessThan(MAX_TITLE_CHARS / 2)
    }
  })

  test('the three largest documents fit in one turn', () => {
    // The gate that matters, and the reason it lives here rather than only
    // in `bun run knowledge:check`: CI runs lint, typecheck, `bun test`
    // and build — not the script. The per-document ceiling cannot promise
    // this on its own (three at the ceiling would be over budget), so the
    // real sum has to be asserted somewhere CI actually looks.
    const sorted = [...corpus.documents].sort(
      (a, b) => b.tokenEstimate - a.tokenEstimate
    )
    const largest = sorted.slice(0, KNOWLEDGE_READ_BUDGET.maxDocuments)
    const worstRead = largest.reduce((sum, d) => sum + d.tokenEstimate, 0)
    expect(
      worstRead,
      `the model could not read ${largest.map(d => d.id).join(', ')} in one answer; split the largest`
    ).toBeLessThanOrEqual(KNOWLEDGE_READ_BUDGET.maxTokens)

    // A model that reads one document twice is charged for it twice but is
    // shown one row, so this is the sequence that could put a row on screen
    // for a read the budget then refuses: the count above an answer would
    // claim a document that was never opened. Two of the largest plus the
    // next is the worst it can be.
    const repeated = 2 * sorted[0].tokenEstimate + sorted[1].tokenEstimate
    expect(
      repeated,
      `re-reading ${sorted[0].id} would exhaust the budget before ${sorted[1].id}; the progress count above an answer would name a document that was refused`
    ).toBeLessThanOrEqual(KNOWLEDGE_READ_BUDGET.maxTokens)
  })

  test('refuses a canonical that points at someone else', () => {
    // A canonical hands another URL the authority for these words; it can
    // only be a page Matt controls.
    expect(() =>
      buildFixture([
        {
          topic: 'career',
          name: 'a-role.md',
          canonical: 'https://example.com/matt',
        },
      ])
    ).toThrow(/canonical must be an https:\/\/matttrifilo\.com URL/)
    expect(() =>
      buildFixture([
        {
          topic: 'career',
          name: 'a-role.md',
          canonical: 'https://matttrifilo.com.evil.test/x',
        },
      ])
    ).toThrow(/canonical must be an https:\/\/matttrifilo\.com URL/)
    // …and the real thing is accepted, in both host spellings.
    for (const canonical of [
      'https://matttrifilo.com/resume',
      'https://www.matttrifilo.com/resume',
    ]) {
      const built = buildFixture([
        { topic: 'career', name: 'a-role.md', canonical },
      ])
      expect(built.documents[0].canonical).toBe(canonical)
    }
  })

  test('refuses frontmatter that declares its own source, or any typo', () => {
    expect(() =>
      buildFixture([
        { topic: 'career', name: 'a-role.md', extra: ["source: 'resume'"] },
      ])
    ).toThrow(/unknown frontmatter key "source"/)
    expect(() =>
      buildFixture([
        { topic: 'career', name: 'a-role.md', extra: ["sumary: 'oops'"] },
      ])
    ).toThrow(/unknown frontmatter key "sumary"/)
  })

  test('source is the topic directory, not a claim the document makes', () => {
    const built = buildFixture([
      { topic: 'career', name: 'a-role.md' },
      { topic: 'faq', name: 'faq.md', body: '## Q?\n\nAn answer.' },
    ])
    for (const document of built.documents) {
      expect(document.source).toBe(document.topic as typeof document.source)
    }
  })
})

describe('documents must survive being compiled as MDX', () => {
  // A blog twin is byte-identical to the post /blog/[slug] compiles with the
  // MDX pipeline, and every page on this site is prerendered, so one bad
  // character in one twin fails the build for the whole site. `{` does not
  // even fail: it evaluates. The rule covers every document so that one
  // moved into blog/ later cannot carry a break in with it.
  const mdxFixture = (body: string) =>
    buildFixture([{ topic: 'career', name: 'a-role.md', body }])

  test('every published document is MDX-safe today', () => {
    // The guard that matters: this is the corpus, not a fixture.
    for (const document of corpus.documents) {
      const fence = /^[ \t]{0,3}(`{3,}|~{3,})/
      let inCode = false
      for (const line of document.text.split('\n')) {
        if (fence.test(line)) {
          inCode = !inCode
          continue
        }
        if (inCode) continue
        expect(
          line.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, ''),
          `${document.id}: ${line}`
        ).not.toMatch(/[<{]/)
      }
    }
  })

  test('refuses a bare tag, which would fail next build for every page', () => {
    expect(() => mdxFixture('Matt uses a <Thing> here.')).toThrow(
      /"<" outside code would break the MDX build/
    )
  })

  test('refuses a comparison written as prose', () => {
    expect(() => mdxFixture('When a<b, the send is retried.')).toThrow(/"<"/)
  })

  test('refuses an autolink, which MDX also rejects', () => {
    expect(() => mdxFixture('See <https://matttrifilo.com/resume>.')).toThrow(
      /"<"/
    )
  })

  test('refuses a brace, which MDX evaluates rather than prints', () => {
    // The quiet one: this is not a syntax error, it is server-side
    // evaluation rendered onto a public page.
    expect(() => mdxFixture('The key is {process.env.SECRET}.')).toThrow(
      /"\{" outside code would break the MDX build/
    )
  })

  test('names the line in the file, and quotes it', () => {
    // Seven lines of frontmatter, a blank line, then the body: the number
    // has to be the one the author's editor shows, not an offset into
    // whatever the loader happens to have sliced off.
    expect(() => mdxFixture('# Title\n\nFine.\n\nBroken <Thing>.')).toThrow(
      /a-role\.md:13:.*Line: Broken <Thing>\./
    )
  })

  test('ignores what is inside an HTML comment, which never ships', () => {
    const built = mdxFixture(
      [
        '# Title',
        '',
        '<!--',
        'Note: <Thing> and {x} live here.',
        '-->',
        '',
        'Done.',
      ].join('\n')
    )
    expect(built.documents[0].text).not.toContain('Note:')
  })

  test('allows both characters inside inline code and fenced blocks', () => {
    const body = [
      '# Title',
      '',
      'Use `<Thing>` and `{value}` in prose by quoting them.',
      '',
      '```tsx',
      'const x = <Thing value={1} />',
      '## not a heading, just a comment',
      '```',
      '',
      'Done.',
    ].join('\n')
    const built = mdxFixture(body)
    expect(built.documents[0].text).toBe(body)
    // The fence also protected the `##` from being read as a section.
    expect(built.documents[0].text).toContain('## not a heading')
  })

  test('refuses a fence that is never closed', () => {
    expect(() => mdxFixture('# Title\n\n```ts\nconst x = 1\n')).toThrow(
      /never closed/
    )
  })

  test('escaped backticks are not a code span, so the tag inside is real', () => {
    // The false negative that would have shipped: `\`a <Thing> b\`` reads
    // as a code span to a naive matcher and as prose to MDX, which then
    // fails the prerender for every page on the site.
    expect(() => mdxFixture('Literal backticks: \\`a <Thing> b\\`')).toThrow(
      /"<" outside code/
    )
  })

  test('an escaped angle bracket is how MDX wants it written, so it passes', () => {
    const built = mdxFixture('Sending fewer than \\<100 messages an hour.')
    expect(built.documents[0].text).toContain('\\<100')
  })

  test('says so when an over-indented fence is the likely cause', () => {
    // A fence indented four or more spaces is valid CommonMark inside a
    // nested list, and this check does not recognise it — recognising it
    // means tracking list context, which is a Markdown parser. It is not
    // silent about it: when something does fail, the message names it.
    const body = [
      '# Title',
      '',
      '1. First step:',
      '',
      '    ```tsx',
      '    const x = <Thing />',
      '    ```',
    ].join('\n')
    expect(() => mdxFixture(body)).toThrow(
      /indented four or more spaces, which this check does not recognise as code/
    )
  })
})

describe('the loaders the site and the chat route use', () => {
  test('a document is fetched by id, and an unknown id is undefined', async () => {
    const { readKnowledgeDocument, listKnowledgeDocuments } =
      await import('./index')
    const first = corpus.documents[0]
    expect(readKnowledgeDocument(first.id)?.text).toBe(first.text)
    expect(listKnowledgeDocuments().map(d => d.id)).toEqual(
      corpus.documents.map(d => d.id)
    )
  })

  test('a hostile id returns undefined rather than throwing', async () => {
    const { readKnowledgeDocument } = await import('./index')
    // The id comes from a model, so every one of these is reachable input.
    for (const id of [
      '',
      'nope',
      '../../../etc/passwd',
      '../resume/resume',
      'resume.md',
      '.',
    ]) {
      expect(readKnowledgeDocument(id), id).toBeUndefined()
    }
    // Not a string at all — a malformed tool call, which must not throw.
    expect(
      readKnowledgeDocument(undefined as unknown as string)
    ).toBeUndefined()
    expect(readKnowledgeDocument(null as unknown as string)).toBeUndefined()
  })

  test('the read budget is the one the route documents', async () => {
    const { KNOWLEDGE_READ_BUDGET } = await import('./index')
    expect(KNOWLEDGE_READ_BUDGET.maxDocuments).toBe(3)
    expect(KNOWLEDGE_READ_BUDGET.maxTokens).toBe(20_000)
  })
})

interface Fixture {
  topic: string
  name: string
  id?: string
  summary?: string
  tags?: string
  canonical?: string
  /** Extra frontmatter lines, verbatim, for testing what is refused. */
  extra?: string[]
  body?: string
}

/**
 * Builds throwaway documents in a temp directory and runs the real build
 * against them, so the authoring errors above are asserted through the
 * same code path the site uses.
 */
function buildFixture(files: Fixture[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-fixture-'))
  try {
    for (const file of files) {
      const id = file.id ?? file.name.replace(/\.md$/, '')
      const frontmatter = [
        '---',
        `id: '${id}'`,
        `title: 'Fixture'`,
        `summary: '${file.summary ?? 'What a reader would learn from it.'}'`,
        `tags: ${file.tags ?? '[fixture]'}`,
        `updated: '2026-09-14'`,
        ...(file.canonical ? [`canonical: '${file.canonical}'`] : []),
        ...(file.extra ?? []),
        '---',
      ].join('\n')
      fs.mkdirSync(path.join(dir, file.topic), { recursive: true })
      fs.writeFileSync(
        path.join(dir, file.topic, file.name),
        `${frontmatter}\n\n${file.body ?? 'Matt led the thing.'}\n`
      )
    }
    return buildKnowledgeCorpus(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
