import { describe, expect, test } from 'bun:test'
import { JOB_TITLE } from './identity'
import { generateBlogPostingSchema, generatePersonSchema } from './jsonld'

describe('Person schema', () => {
  test('uses the single site-wide job title', () => {
    expect(generatePersonSchema().jobTitle).toBe(JOB_TITLE)
  })
})

describe('BlogPosting schema', () => {
  test('carries the post date and canonical URL', () => {
    const schema = generateBlogPostingSchema({ title: 'T', date: '2026-03-01', slug: 'my-post' })
    expect(schema.datePublished).toBe('2026-03-01')
    expect(schema.url).toBe('https://matttrifilo.com/blog/my-post')
  })
})
