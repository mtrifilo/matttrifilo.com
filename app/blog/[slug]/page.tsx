import { notFound } from 'next/navigation'
import { getBlogPost, getBlogSlugs } from '@/lib/blog'
import { MDXContent } from '@/components/blog/mdx-content'
import Link from 'next/link'
import { JsonLd } from '@/components/seo/JsonLd'
import { generateBlogPostingSchema } from '@/lib/seo/jsonld'

interface BlogPostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = getBlogSlugs()
  return slugs.map(slug => ({ slug }))
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params
  const post = getBlogPost(slug)

  if (!post) {
    return { title: 'Post Not Found' }
  }

  const cleanTitle = post.frontmatter.title.replace(/\n/g, ' ')

  return {
    title: cleanTitle,
    description: post.frontmatter.description || post.excerpt,
    alternates: {
      canonical: `https://matttrifilo.com/blog/${slug}`,
    },
    openGraph: {
      title: cleanTitle,
      description: post.frontmatter.description || post.excerpt,
      type: 'article',
      publishedTime: post.frontmatter.date,
      url: `/blog/${slug}`,
      images: [
        {
          url: '/og-image.jpg',
          width: 1200,
          height: 630,
          alt: cleanTitle,
        },
      ],
    },
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const post = getBlogPost(slug)

  if (!post) {
    notFound()
  }

  return (
    <>
      <div className="reading-progress-bar" aria-hidden="true" />
      <JsonLd
        data={generateBlogPostingSchema({
          title: post.frontmatter.title,
          date: post.frontmatter.date,
          description: post.frontmatter.description || post.excerpt,
          slug,
        })}
      />
      <div className="flex min-h-screen items-start justify-center">
        <article className="w-full max-w-3xl px-4 py-8 md:px-8">
          <header className="mb-8">
            <h1
              className="font-bold leading-tight mb-3"
              style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
            >
              {post.frontmatter.title.split('\n').map((line: string, i: number, arr: string[]) => (
                <span key={i}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </span>
              ))}
            </h1>

            <div className="text-sm text-muted-foreground flex flex-wrap gap-2 items-center">
              <time>{formatDate(post.frontmatter.date)}</time>

              {post.frontmatter.categories &&
                post.frontmatter.categories.length > 0 && (
                  <>
                    <span>·</span>
                    <span>{post.frontmatter.categories.join(', ')}</span>
                  </>
                )}
            </div>
          </header>

          <div className="text-base leading-relaxed">
            <MDXContent source={post.content} />
          </div>

          <footer className="mt-12 pt-6 border-t border-border">
            <Link
              href="/blog"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; Back to Blog
            </Link>
          </footer>
        </article>
      </div>
    </>
  )
}
