import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { getAllBlogPosts, getBlogPost } from '@/lib/blog'
import { JOB_TITLE } from './identity'
import {
  generateBlogPostingSchema,
  generatePersonSchema,
  postImageUrl,
} from './jsonld'

describe('Person schema', () => {
  test('uses the single site-wide job title', () => {
    expect(generatePersonSchema().jobTitle).toBe(JOB_TITLE)
  })
})

describe('BlogPosting schema', () => {
  const post = { title: 'T', date: '2026-03-01', slug: 'my-post' }

  test('carries the post date and canonical URL', () => {
    const schema = generateBlogPostingSchema(post)
    expect(schema.datePublished).toBe('2026-03-01')
    expect(schema.url).toBe('https://matttrifilo.com/blog/my-post')
  })

  test('dateModified is the updated date when the post has one', () => {
    const schema = generateBlogPostingSchema({ ...post, updated: '2026-04-15' })
    expect(schema.datePublished).toBe('2026-03-01')
    expect(schema.dateModified).toBe('2026-04-15')
  })

  test('dateModified falls back to the publish date', () => {
    expect(generateBlogPostingSchema(post).dateModified).toBe('2026-03-01')
  })

  test('the headline is one line', () => {
    const schema = generateBlogPostingSchema({
      ...post,
      title: 'First line.\nSecond line.',
    })
    expect(schema.headline).toBe('First line. Second line.')
  })

  test('a CRLF break and the spaces around it become one space', () => {
    const schema = generateBlogPostingSchema({
      ...post,
      title: 'First line. \r\n  Second line.',
    })
    expect(schema.headline).toBe('First line. Second line.')
  })

  test('the image is the post social card route', () => {
    expect(generateBlogPostingSchema(post).image).toBe(
      'https://matttrifilo.com/blog/my-post/opengraph-image'
    )
    // The URL is only right while the route file it names exists.
    expect(
      fs.existsSync(
        path.join(process.cwd(), 'app', 'blog', '[slug]', 'opengraph-image.tsx')
      )
    ).toBe(true)
  })

  test('mainEntityOfPage is the canonical post URL', () => {
    expect(generateBlogPostingSchema(post).mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://matttrifilo.com/blog/my-post',
    })
  })
})

describe('BlogPosting schema for each published post', () => {
  const posts = getAllBlogPosts()

  test('there is a post to check', () => {
    expect(posts.length).toBeGreaterThan(0)
  })

  for (const meta of posts) {
    // Built from the same fields app/blog/[slug]/page.tsx passes.
    const full = getBlogPost(meta.slug)!
    const schema = generateBlogPostingSchema({
      title: full.frontmatter.title,
      date: full.frontmatter.date,
      updated: full.frontmatter.updated,
      description: full.frontmatter.description || full.excerpt,
      slug: meta.slug,
    })

    test(`${meta.slug}: carries the fields the Article rich result reads`, () => {
      expect(schema['@context']).toBe('https://schema.org')
      expect(schema['@type']).toBe('BlogPosting')
      expect(schema.headline.length).toBeGreaterThan(0)
      expect(schema.headline).not.toMatch(/[\r\n]/)
      expect(schema.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(schema.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(schema.dateModified >= schema.datePublished).toBe(true)
      expect(schema.image).toBe(postImageUrl(meta.slug))
      expect(schema.author.name).toBe('Matt Trifilo')
      expect(schema.author.url).toBe('https://matttrifilo.com')
      expect(schema.mainEntityOfPage['@id']).toBe(schema.url)
      expect(schema.description?.trim().length).toBeGreaterThan(0)
    })

    test(`${meta.slug}: the description says more than the title`, () => {
      // A description that repeats the headline makes the search snippet
      // and the shared-link preview say the same thing twice.
      expect(schema.description).not.toBe(schema.headline)
    })
  }
})
