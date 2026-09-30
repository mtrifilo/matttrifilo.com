import type { CSSProperties } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import type { BlogPostMeta } from '@/lib/types/blog'

type HeadingLevel = 2 | 3

/**
 * The title's size and weight follow its level: on /blog each post is a
 * section of the page (h2), on the homepage a post sits under the "Latest
 * Posts" h2 (h3), a step smaller.
 */
const titleClass: Record<HeadingLevel, string> = {
  2: 'text-xl font-semibold',
  3: 'text-lg font-medium',
}

/** One post in a list: its title, linked to the post, and its date. */
export function PostListItem({
  post,
  headingLevel,
  index,
  className,
}: {
  post: Pick<BlogPostMeta, 'slug' | 'title' | 'date'>
  /** The level that fits the page's outline where the list sits. */
  headingLevel: HeadingLevel
  /** Position in the list, which staggers the entrance animation. */
  index: number
  /** The list's own spacing between rows, which differs by surface. */
  className?: string
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <article
      className={cn(
        'animate-fade-in-up border-b border-border pb-6',
        className
      )}
      style={{ '--index': index } as CSSProperties}
    >
      <Heading className={cn(titleClass[headingLevel], 'leading-tight')}>
        <Link
          href={`/blog/${post.slug}`}
          className="hover:text-muted-foreground transition-colors"
        >
          {post.title}
        </Link>
      </Heading>
      <p className="text-sm text-muted-foreground mt-1">
        {formatDate(post.date)}
      </p>
    </article>
  )
}
