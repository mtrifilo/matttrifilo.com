import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openSourceRepos } from '@/content/open-source'
import {
  buildKnowledgeBase,
  estimateTokens,
  KNOWLEDGE_DIR,
  KNOWLEDGE_TOKEN_CEILING,
} from './build'

/**
 * The mechanical guard on what the career assistant is allowed to read.
 *
 * content/knowledge/*.md is the assistant's only source, and it is written
 * for the public. These assertions run against the built text — what the
 * model actually receives — rather than the files, so a leak cannot slip
 * in through the wrapper, the ordering, or a section the build assembles.
 *
 * scripts/knowledge-denylist-check.sh is the second half of the guard: it
 * greps the files against a private denylist that only exists on Matt's
 * machine. This file holds everything that can live in the repo.
 */

const base = buildKnowledgeBase()
const built = base.text

/**
 * The text with URLs removed: markdown link targets and any bare http(s)
 * URL, including the ones in the section wrapper.
 *
 * Patterns that describe *prose* are checked against this view. A public
 * URL is a citation to someone else's page, and its slug and query string
 * routinely contain digit runs and words that mean nothing about Matt —
 * a news URL with "layoffs" in it, a status id that looks like a phone
 * number. Checking prose against prose keeps those from either failing the
 * build or, worse, training everyone to loosen the patterns. Guards that
 * are about leaked contact details (addresses, TODOs, amounts) still run
 * against the full text.
 */
function prose(text: string): string {
  return text.replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, '')
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
  // blog-from-typing-code-to-agent-factories: startup runway, about AI
  // companies raising money, not about anyone's personal finances.
  'run out of runway',
  'the runway to afford',
  // blog-from-typing-code-to-agent-factories: a model name that happens to
  // have the shape of an issue key.
  'GPT-5.3',
]

function withoutReviewedPhrases(text: string): string {
  return REVIEWED_PUBLIC_PHRASES.reduce(
    (acc, phrase) => acc.split(phrase).join(''),
    text
  )
}

const proseText = withoutReviewedPhrases(prose(built))

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

describe('knowledge base content guards', () => {
  test('positive control: the guards are running against real text', () => {
    // If the build ever returned an empty string, every "not to match"
    // assertion below would pass for the wrong reason.
    expect(built.length).toBeGreaterThan(10_000)
    expect(built).toContain('Matt Trifilo')
    expect(built).toContain('<section id="resume"')
    expect(proseText.length).toBeGreaterThan(10_000)
  })

  test('contains no phone number', () => {
    expect(proseText).not.toMatch(/\d{3}[-. ()]*\d{3}[-. ()]*\d{4}/)
    expect(proseText).not.toMatch(/\+1[\s-]?\d/)
  })

  test('the only email address is the public contact', () => {
    const addresses = [...new Set(built.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [])]
    expect(addresses).toEqual([PUBLIC_CONTACT])
  })

  test('contains no dollar amounts', () => {
    expect(built).not.toMatch(/\$\s*[\d.,]/)
  })

  test('contains no issue-tracker keys', () => {
    const keys = [...new Set(proseText.match(/\b[A-Z]{2,5}-\d+\b/g) ?? [])]
    expect(keys).toEqual([])
  })

  test('contains none of the forbidden words', () => {
    const hits = FORBIDDEN_WORDS.filter(word =>
      new RegExp(`\\b${word}\\b`, 'i').test(proseText)
    )
    expect(hits).toEqual([])
  })

  test('contains no TODO placeholder', () => {
    expect(built).not.toMatch(/\bTODO\b/)
  })

  test('drops the unanswered FAQ questions entirely', () => {
    // faq.md ships eight questions with `TODO (Matt)` bodies. Until Matt
    // answers one, the section must not exist at all — not exist and be
    // empty, and certainly not carry the placeholders into the prompt.
    const faqSource = fs.readFileSync(
      path.join(KNOWLEDGE_DIR, 'faq.md'),
      'utf8'
    )
    expect(faqSource).toContain('TODO (Matt)')
    expect(base.sections.map(s => s.id)).not.toContain('faq')
    expect(built).not.toContain("What does Matt's team own?")
  })
})

describe('knowledge base structure', () => {
  test('every file carries the full frontmatter contract', () => {
    const names = fs
      .readdirSync(KNOWLEDGE_DIR)
      .filter(name => name.endsWith('.md'))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const contents = fs.readFileSync(path.join(KNOWLEDGE_DIR, name), 'utf8')
      const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/.exec(contents)
      expect(match, `${name} has no frontmatter block`).not.toBeNull()
      const frontmatter = match![1]
      for (const key of ['id', 'title', 'url', 'source', 'updated']) {
        expect(frontmatter, `${name} is missing ${key}`).toMatch(
          new RegExp(`^${key}:[ \\t]*\\S`, 'm')
        )
      }
      // buildKnowledgeBase enforces id === basename, which is what makes
      // ids stable and unique; assert it here too so the reason is
      // visible where the contract is described.
      expect(frontmatter).toMatch(
        new RegExp(`^id:[ \\t]*['"]?${name.replace(/\.md$/, '')}['"]?[ \\t]*$`, 'm')
      )
    }
  })

  test('section ids are unique', () => {
    const ids = base.sections.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('sections come out in the documented order', () => {
    const ids = base.sections.map(s => s.id)
    const fixed = ids.filter(id => !id.startsWith('blog-'))
    expect(fixed).toEqual([
      'resume',
      'projects',
      'career-timeline',
      'open-source',
    ])
    // 'faq' is absent only because every question is still a TODO; it sits
    // between 'resume' and 'projects' as soon as one is answered.
    const blog = base.sections.filter(s => s.id.startsWith('blog-'))
    expect(ids.slice(fixed.length)).toEqual(blog.map(s => s.id))
    // `updated` is not part of the KnowledgeSection contract, so read the
    // dates back off disk to check the newest-first ordering.
    const dates = blog.map(section => {
      const file = fs.readFileSync(
        path.join(KNOWLEDGE_DIR, `${section.id}.md`),
        'utf8'
      )
      return /^updated:[ \t]*'?([\d-]+)'?/m.exec(file)![1]
    })
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  test('every section is wrapped so the model can cite it', () => {
    for (const section of base.sections) {
      expect(built).toContain(
        `<section id="${section.id}" title="${section.title}" url="${section.url}">`
      )
      expect(section.url.startsWith('https://')).toBe(true)
    }
    const opens = built.match(/<section /g) ?? []
    const closes = built.match(/<\/section>/g) ?? []
    expect(opens.length).toBe(base.sections.length)
    expect(closes.length).toBe(base.sections.length)
  })
})

describe('knowledge base stays in sync with its public sources', () => {
  const sectionText = (id: string) => {
    const section = base.sections.find(s => s.id === id)
    expect(section, `no section ${id}`).toBeDefined()
    return section!.text
  }

  test('the résumé section is the published résumé, verbatim', () => {
    // content/resume.md is regenerated by scripts/render-resume.sh from a
    // private source. Without this, a regeneration would quietly leave the
    // assistant answering from a stale résumé.
    const published = fs.readFileSync(
      path.join(process.cwd(), 'content', 'resume.md'),
      'utf8'
    )
    expect(sectionText('resume')).toBe(published.trim())
  })

  test('every blog post has a section carrying the published body', () => {
    const blogDir = path.join(process.cwd(), 'content', 'blog')
    const slugs = fs
      .readdirSync(blogDir)
      .filter(name => name.endsWith('.md') && !name.startsWith('_'))
      .map(name => name.replace(/\.md$/, ''))
    expect(slugs.length).toBeGreaterThan(0)

    for (const slug of slugs) {
      const post = fs.readFileSync(path.join(blogDir, `${slug}.md`), 'utf8')
      const body = post.replace(
        /^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/,
        ''
      )
      const section = base.sections.find(s => s.id === `blog-${slug}`)
      expect(section, `content/blog/${slug}.md has no knowledge file`).toBeDefined()
      expect(section!.source).toBe('blog')
      expect(section!.url).toBe(`https://matttrifilo.com/blog/${slug}`)
      expect(section!.text).toBe(body.trim())
      // Frontmatter stripped: the post's own YAML must not be in the text.
      expect(section!.text).not.toContain('description:')
    }
  })

  test('every curated open-source project is described', () => {
    // content/open-source.ts is the reviewed list the /open-source page
    // renders; adding a project there without describing it here would
    // leave the assistant unaware of work the site already shows.
    const text = sectionText('open-source')
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

describe('knowledge base build', () => {
  test('is byte-stable: two builds produce identical text', () => {
    const again = buildKnowledgeBase()
    expect(again.text).toBe(built)
    expect(again.tokenEstimate).toBe(base.tokenEstimate)
    expect(again.sections).toEqual(base.sections)
  })

  test('token estimate is chars/4, rounded up', () => {
    expect(base.tokenEstimate).toBe(Math.ceil(built.length / 4))
    expect(estimateTokens('abcde')).toBe(2)
  })

  test('stays under the token ceiling', () => {
    expect(base.tokenEstimate).toBeLessThanOrEqual(KNOWLEDGE_TOKEN_CEILING)
  })

  test('throws when the knowledge base would exceed the ceiling', () => {
    // Long enough to break the real ceiling, not a lowered stand-in, so the
    // published constant is what is actually under test.
    const oversized = 'Matt led the thing. '.repeat(
      Math.ceil((KNOWLEDGE_TOKEN_CEILING * 4) / 20) + 100
    )
    expect(() =>
      buildFixture({ name: 'resume.md', body: oversized })
    ).toThrow(/too large for the prompt/)
  })

  test('refuses a file whose id does not match its name', () => {
    expect(() =>
      buildFixture({ name: 'resume.md', id: 'not-resume' })
    ).toThrow(/must match the file name/)
  })

  test('refuses a section it does not know where to order', () => {
    expect(() => buildFixture({ name: 'talks.md' })).toThrow(/unknown section/)
  })
})

/**
 * Builds one throwaway knowledge file in a temp directory and runs the real
 * build against it, so the authoring errors above are asserted through the
 * same code path the site uses.
 */
function buildFixture(file: {
  name: string
  id?: string
  source?: string
  body?: string
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-fixture-'))
  try {
    const id = file.id ?? file.name.replace(/\.md$/, '')
    const frontmatter = [
      '---',
      `id: '${id}'`,
      `title: 'Fixture'`,
      `url: 'https://matttrifilo.com/${id}'`,
      `source: '${file.source ?? 'derived'}'`,
      `updated: '2026-09-14'`,
      '---',
    ].join('\n')
    fs.writeFileSync(
      path.join(dir, file.name),
      `${frontmatter}\n\n${file.body ?? 'Matt led the thing.'}\n`
    )
    return buildKnowledgeBase(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
