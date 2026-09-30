import { describe, expect, test } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { PostListItem } from './PostListItem'

/**
 * The one post row the homepage and /blog both render. Each surface keeps
 * its own heading level, size and weight, and its own spacing between rows;
 * these tests pin both so a change to one surface cannot reach the other.
 */

// March 1 is the date a zone west of UTC would render as February 28.
const post = {
  slug: '2026-03-01-a-post',
  title: 'A post',
  date: '2026-03-01',
}

describe('PostListItem on /blog (h2)', () => {
  test('renders the title as an h2 at the index size, linked to the post', () => {
    render(<PostListItem post={post} headingLevel={2} index={0} />)
    const heading = screen.getByRole('heading', { level: 2, name: 'A post' })
    expect(heading.className).toBe('text-xl font-semibold leading-tight')
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
    const link = screen.getByRole('link', { name: 'A post' })
    expect(link.getAttribute('href')).toBe('/blog/2026-03-01-a-post')
    expect(heading.contains(link)).toBe(true)
  })

  test("adds the index's row spacing to the shared row classes", () => {
    const { container } = render(
      <PostListItem
        post={post}
        headingLevel={2}
        index={4}
        className="mt-6 first:mt-0"
      />
    )
    const article = container.querySelector('article')!
    expect(article.className).toBe(
      'animate-fade-in-up border-b border-border pb-6 mt-6 first:mt-0'
    )
    expect(article.style.getPropertyValue('--index')).toBe('4')
  })
})

describe('PostListItem on the homepage (h3)', () => {
  test('renders the title as an h3 a step smaller, linked to the post', () => {
    render(<PostListItem post={post} headingLevel={3} index={0} />)
    const heading = screen.getByRole('heading', { level: 3, name: 'A post' })
    expect(heading.className).toBe('text-lg font-medium leading-tight')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    const link = screen.getByRole('link', { name: 'A post' })
    expect(link.getAttribute('href')).toBe('/blog/2026-03-01-a-post')
    expect(heading.contains(link)).toBe(true)
  })

  test("adds the homepage's last-row rule to the shared row classes", () => {
    const { container } = render(
      <PostListItem
        post={post}
        headingLevel={3}
        index={2}
        className="last:border-0"
      />
    )
    const article = container.querySelector('article')!
    expect(article.className).toBe(
      'animate-fade-in-up border-b border-border pb-6 last:border-0'
    )
    expect(article.style.getPropertyValue('--index')).toBe('2')
  })
})

describe('the date', () => {
  // The suite runs twice before a push: plain `bun test`, which Bun runs in
  // UTC, and `TZ=America/Phoenix bun test`, as CI does. The Phoenix run is
  // the one that would show February 28 if the date lost its UTC pin.
  test.each([2, 3] as const)(
    'is the date the author wrote, at heading level %i',
    headingLevel => {
      render(<PostListItem post={post} headingLevel={headingLevel} index={0} />)
      expect(screen.getByText('March 1, 2026').tagName).toBe('P')
    }
  )
})
