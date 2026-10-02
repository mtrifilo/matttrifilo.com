import { afterEach, describe, expect, test } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import BlogPage from '@/app/blog/page'
import Home from '@/app/page'
import { PostListItem } from './PostListItem'

/**
 * The one post row the homepage and /blog both render. Each surface has its
 * own heading level, size and weight, and its own row classes. The class
 * lists are pinned exactly: the row's look is the contract, so a change to
 * it should be a deliberate edit here, not a side effect.
 */

// March 1 is the date a zone west of UTC would render as February 28.
const post = {
  slug: '2026-03-01-a-post',
  title: 'A post',
  date: '2026-03-01',
}

describe('PostListItem', () => {
  test('at level 2: an h2 at text-xl semibold, linked to the post', () => {
    render(<PostListItem post={post} headingLevel={2} index={0} />)
    const heading = screen.getByRole('heading', { level: 2, name: 'A post' })
    expect(heading.className).toBe('text-xl font-semibold leading-tight')
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
    const link = screen.getByRole('link', { name: 'A post' })
    expect(link.getAttribute('href')).toBe('/blog/2026-03-01-a-post')
    expect(heading.contains(link)).toBe(true)
  })

  test('at level 3: an h3 at text-lg medium, linked to the post', () => {
    render(<PostListItem post={post} headingLevel={3} index={0} />)
    const heading = screen.getByRole('heading', { level: 3, name: 'A post' })
    expect(heading.className).toBe('text-lg font-medium leading-tight')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    const link = screen.getByRole('link', { name: 'A post' })
    expect(link.getAttribute('href')).toBe('/blog/2026-03-01-a-post')
    expect(heading.contains(link)).toBe(true)
  })

  test('its position sets the entrance delay', () => {
    const { container } = render(
      <PostListItem post={post} headingLevel={2} index={4} />
    )
    const article = container.querySelector('article')!
    expect(article.style.getPropertyValue('--index')).toBe('4')
  })

  // CI runs the suite with TZ=America/Phoenix, where a date without its UTC
  // pin would show February 28; a plain `bun test` runs in UTC.
  test('shows the date the author wrote', () => {
    render(<PostListItem post={post} headingLevel={2} index={0} />)
    expect(screen.getByText('March 1, 2026').tagName).toBe('P')
  })
})

/** The first post row a page renders, parsed so it can be queried. */
function firstRow(html: string): HTMLElement {
  const page = document.createElement('div')
  page.innerHTML = html
  const row = page.querySelector<HTMLElement>('article')
  if (!row) throw new Error('the page rendered no post row')
  return row
}

describe('each surface renders its rows from PostListItem', () => {
  const chatDisabled = process.env.CHAT_DISABLED

  afterEach(() => {
    if (chatDisabled === undefined) delete process.env.CHAT_DISABLED
    else process.env.CHAT_DISABLED = chatDisabled
  })

  test('/blog: an h2 row, spaced by a top margin', () => {
    const row = firstRow(renderToStaticMarkup(<BlogPage />))
    expect(row.className).toBe(
      'animate-fade-in-up border-b border-border pb-6 mt-6 first:mt-0'
    )
    expect(row.querySelector('h2')?.className).toBe(
      'text-xl font-semibold leading-tight'
    )
  })

  test('the homepage: an h3 row, the last one without a rule', () => {
    // The assistant panel needs the app router mounted, which a static
    // render has not; with the assistant off the page leaves it out.
    process.env.CHAT_DISABLED = '1'
    const row = firstRow(renderToStaticMarkup(<Home />))
    expect(row.className).toBe(
      'animate-fade-in-up border-b border-border pb-6 last:border-0'
    )
    expect(row.querySelector('h3')?.className).toBe(
      'text-lg font-medium leading-tight'
    )
  })
})
