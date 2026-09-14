import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildKnowledgeBase } from '@/lib/knowledge/build'
import {
  buildKnowledgeTwin,
  buildPostFile,
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

  test('the twin loads as a blog section at the post URL', () => {
    const slug = postSlug(draft.title, draft.date)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-post-'))
    try {
      fs.writeFileSync(
        path.join(dir, `blog-${slug}.md`),
        buildKnowledgeTwin(draft)
      )
      const [section] = buildKnowledgeBase(dir).sections
      expect(section.id).toBe(`blog-${slug}`)
      expect(section.source).toBe('blog')
      expect(section.url).toBe(`https://matttrifilo.com/blog/${slug}`)
      // An apostrophe in the title must survive the frontmatter quoting.
      expect(section.title).toBe(draft.title)
      expect(section.text).toBe(STARTER_BODY.trim())
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
