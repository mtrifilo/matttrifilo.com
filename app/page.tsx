import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Github, Linkedin } from '@/components/icons/brand-icons'
import { EvalsPublishedProvider } from '@/components/assistant/evals-published'
import { HomeAssistantPanel } from '@/components/assistant/home-assistant-panel'
import { PostListItem } from '@/components/blog/PostListItem'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { getAllBlogPosts } from '@/lib/blog'
import { hasPublishedEvalRun } from '@/lib/evals/results'
import { JOB_TITLE, TAGLINE } from '@/lib/seo/identity'

export default function Home() {
  const recentPosts = getAllBlogPosts().slice(0, 3)

  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-12 md:px-8">
        {/* Hero */}
        <section className="mb-16 hero-glow">
          <h1 className="font-bold mb-1 text-display">Matt Trifilo</h1>
          <p className="text-xl text-muted-foreground">{JOB_TITLE}</p>
          <p className="text-base leading-relaxed text-foreground/90 max-w-2xl mt-6">
            {TAGLINE}
          </p>
          <div className="flex items-center gap-4 mt-4">
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
              href="mailto:matt.trifilo@gmail.com"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Email"
            >
              <Mail className="h-5 w-5" />
            </Link>
          </div>
        </section>

        {/* Matt's Career Assistant: a working input, not an advert for one.
            Submitting from here opens /ask with the answer already coming. */}
        {!isChatDisabled() && (
          <div className="mb-16">
            <EvalsPublishedProvider published={hasPublishedEvalRun()}>
              <HomeAssistantPanel />
            </EvalsPublishedProvider>
          </div>
        )}

        {/* Latest Posts */}
        {recentPosts.length > 0 && (
          <section>
            <h2 className="font-semibold mb-6 text-section-title">
              Latest Posts
            </h2>
            <div className="space-y-6">
              {recentPosts.map((post, i) => (
                <PostListItem
                  key={post.slug}
                  post={post}
                  headingLevel={3}
                  index={i}
                  className="last:border-0"
                />
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
