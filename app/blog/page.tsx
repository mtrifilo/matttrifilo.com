import { PostListItem } from '@/components/blog/PostListItem'
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

export default function BlogPage() {
  const posts = getAllBlogPosts()

  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-8 md:px-8">
        <h1 className="font-bold text-center mb-8 text-page-title">Blog</h1>

        <section className="w-full">
          {posts.map((post, i) => (
            <PostListItem
              key={post.slug}
              post={post}
              headingLevel={2}
              index={i}
              className="mt-6 first:mt-0"
            />
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
