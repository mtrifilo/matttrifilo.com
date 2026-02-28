import Link from 'next/link'
import { Github, Linkedin, Mail } from 'lucide-react'
import { getAllBlogPosts } from '@/lib/blog'

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function Home() {
  const recentPosts = getAllBlogPosts().slice(0, 3)

  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-12 md:px-8">
        {/* Hero */}
        <section className="mb-16 hero-glow">
          <h1
            className="font-bold mb-2"
            style={{ fontSize: 'clamp(2rem, 5vw + 0.5rem, 3.5rem)' }}
          >
            Matt Trifilo
          </h1>
          <p className="text-xl text-muted-foreground mb-1">
            Software Engineering Leader
          </p>
          <p className="text-xl text-muted-foreground mb-4">Agentic Engineer</p>
          <p className="text-base leading-relaxed text-foreground/90 max-w-2xl">
            I build software products, and level up teams.
          </p>
          <div className="flex items-center gap-4 mt-6">
            <Link
              href="https://github.com/mtrifilo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </Link>
            <Link
              href="https://linkedin.com/in/matttrifilo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-5 w-5" />
            </Link>
            <Link
              href="mailto:matt@matttrifilo.com"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Email"
            >
              <Mail className="h-5 w-5" />
            </Link>
          </div>
        </section>

        {/* Latest Posts */}
        {recentPosts.length > 0 && (
          <section>
            <h2
              className="font-semibold mb-6"
              style={{ fontSize: 'clamp(1.5rem, 3vw + 0.25rem, 2rem)' }}
            >
              Latest Posts
            </h2>
            <div className="space-y-6">
              {recentPosts.map((post, i) => (
                <article
                  key={post.slug}
                  className="blog-article animate-fade-in-up border-b border-border pb-6 last:border-0"
                  style={{ '--index': i } as React.CSSProperties}
                >
                  <h3 className="text-lg font-medium leading-tight">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="hover:text-muted-foreground transition-colors"
                    >
                      {post.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(post.date)}
                  </p>
                  <p className="mt-2 text-foreground/90 leading-relaxed">
                    {post.excerpt}
                  </p>
                </article>
              ))}
            </div>
            <Link
              href="/blog"
              className="inline-block mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View all posts &rarr;
            </Link>
          </section>
        )}
      </div>
    </div>
  )
}
