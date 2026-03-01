import Link from 'next/link'
import { getAllBlogPosts } from '@/lib/blog'

export const metadata = {
  title: 'Blog',
  description:
    'Blog posts about software development, technology, and engineering.',
  openGraph: {
    title: 'Blog | Matt Trifilo',
    description:
      'Blog posts about software development, technology, and engineering.',
    url: '/blog',
    type: 'website',
  },
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function BlogPage() {
  const posts = getAllBlogPosts()

  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-8 md:px-8">
        <h1
          className="font-bold text-center mb-8"
          style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
        >
          Blog
        </h1>

        <section className="w-full">
          {posts.map((post, i) => (
            <article
              key={post.slug}
              className="blog-article animate-fade-in-up border-b border-border pb-6 mt-6 first:mt-0"
              style={{ '--index': i } as React.CSSProperties}
            >
              <h2 className="text-xl font-semibold leading-tight">
                <Link
                  href={`/blog/${post.slug}`}
                  className="hover:text-muted-foreground transition-colors"
                >
                  {post.title}
                </Link>
              </h2>

              <div className="text-sm text-muted-foreground mt-1">
                {formatDate(post.date)}
              </div>

            </article>
          ))}

          {posts.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              No blog posts yet.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
