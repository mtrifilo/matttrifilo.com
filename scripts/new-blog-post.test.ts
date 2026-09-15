import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildKnowledgeCorpus } from '@/lib/knowledge/build'
import {
  buildKnowledgeTwin,
  buildPostFile,
  draftSummary,
  postSlug,
  STARTER_BODY,
  type PostDraft,
} from './new-blog-post'

/**
 * A new post and its knowledge twin are written together, and the sync
 * guard in lib/knowledge/knowledge.test.ts fails the suite if they ever
 * drift. These cases check the scaffold produces a twin the loader
 * actually accepts — otherwise the first thing a new post does is turn the
 * suite red, which is what this scaffold exists to prevent.
 */

const draft: PostDraft = {
  title: "Matt's Notes on Shipping",
  date: '2026-09-14',
  categories: ['engineering'],
  description: 'A short note.',
}

const stripFrontmatter = (file: string) =>
  file.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '')

describe('new-blog-post scaffold', () => {
  test('the slug carries the date prefix lib/blog.ts reads', () => {
    expect(postSlug(draft.title, draft.date)).toBe(
      '2026-09-14-matt-s-notes-on-shipping'
    )
  })

  test('both files carry the same body', () => {
    const post = stripFrontmatter(buildPostFile(draft))
    const twin = stripFrontmatter(buildKnowledgeTwin(draft))
    expect(post).toBe(twin)
    expect(post.trim()).toBe(STARTER_BODY.trim())
  })

  test('the twin loads as a blog document under content/knowledge/blog', () => {
    const slug = postSlug(draft.title, draft.date)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-post-'))
    try {
      // The twin's home is the blog topic directory; a file written
      // anywhere else is not a document the corpus can see.
      fs.mkdirSync(path.join(dir, 'blog'))
      fs.writeFileSync(
        path.join(dir, 'blog', `${slug}.md`),
        buildKnowledgeTwin(draft)
      )
      const [document] = buildKnowledgeCorpus(dir).documents
      expect(document.id).toBe(slug)
      expect(document.topic).toBe('blog')
      expect(document.source).toBe('blog')
      expect(document.url).toBe(`/knowledge/${slug}`)
      expect(document.canonical).toBe(`https://matttrifilo.com/blog/${slug}`)
      // An apostrophe in the title must survive the frontmatter quoting.
      expect(document.title).toBe(draft.title)
      expect(document.summary).toBe(draftSummary(draft))
      expect(document.tags).toEqual(['blog', 'engineering'])
      expect(document.text).toBe(STARTER_BODY.trim())
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the summary falls back to the title and never overruns the index', () => {
    // The build refuses a summary over 160 characters, so a long
    // description must not be able to turn the scaffold's own output into
    // a file that fails to load.
    expect(draftSummary({ ...draft, description: undefined })).toBe(draft.title)
    expect(draftSummary({ ...draft, description: '   ' })).toBe(draft.title)
    const long = draftSummary({ ...draft, description: 'word '.repeat(60) })
    expect(long.length).toBeLessThanOrEqual(160)
    expect(long.endsWith('…')).toBe(true)
  })
})
