import { describe, expect, test } from 'bun:test'
import { generateBlogPostingSchema, generatePersonSchema } from './jsonld'

/**
 * The fields each schema needs to be read as what it is. Field-by-field
 * rather than a whole-object match, so a schema can gain a field without
 * failing here.
 */
describe('BlogPosting required fields', () => {
  const post = {
    title: 'A post title',
    date: '2026-03-01',
    description: 'What the post is about.',
    slug: 'a-post',
  }
  const schema = generateBlogPostingSchema(post)

  test('declares the schema.org BlogPosting type', () => {
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('BlogPosting')
  })

  test('the headline is the post title', () => {
    expect(schema.headline).toBe('A post title')
  })

  test('names Matt as the author, with the site as his URL', () => {
    expect(schema.author).toEqual({
      '@type': 'Person',
      name: 'Matt Trifilo',
      url: 'https://matttrifilo.com',
    })
  })

  test('carries the description when the post has one, and omits it from the JSON when not', () => {
    expect(schema.description).toBe('What the post is about.')
    const withoutDescription = generateBlogPostingSchema({
      title: post.title,
      date: post.date,
      slug: post.slug,
    })
    expect(JSON.parse(JSON.stringify(withoutDescription))).not.toHaveProperty(
      'description'
    )
  })
})

describe('Person required fields', () => {
  const person = generatePersonSchema()

  test('declares the schema.org Person type with a name and the site URL', () => {
    expect(person['@context']).toBe('https://schema.org')
    expect(person['@type']).toBe('Person')
    expect(person.name).toBe('Matt Trifilo')
    expect(person.url).toBe('https://matttrifilo.com')
  })

  test('links at least one profile, each an https URL', () => {
    expect(person.sameAs.length).toBeGreaterThan(0)
    for (const profile of person.sameAs) {
      expect(new URL(profile).protocol).toBe('https:')
    }
  })
})
