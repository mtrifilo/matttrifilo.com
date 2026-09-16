import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MDXContent } from '@/components/blog/mdx-content'
import { formatDate } from '@/lib/format-date'
import { listKnowledgeDocuments, readKnowledgeDocument } from '@/lib/knowledge'
import { topicLabel } from '../topic-label'
import { isChatDisabled } from '@/lib/chat/kill-switch'

interface KnowledgeDocumentPageProps {
  params: Promise<{ id: string }>
}

export function generateStaticParams() {
  return listKnowledgeDocuments().map(document => ({ id: document.id }))
}

/**
 * Only the ids above are pages. A document the corpus dropped — an FAQ
 * whose answers are all still TODO — must 404 rather than be rendered on
 * demand from whatever is on disk, so the published set and the set the
 * assistant reads can never drift apart.
 */
export const dynamicParams = false

export async function generateMetadata({
  params,
}: KnowledgeDocumentPageProps): Promise<Metadata> {
  if (isChatDisabled()) notFound()
  const { id } = await params
  const document = readKnowledgeDocument(id)
  if (!document) return { title: 'Not Found' }

  return {
    title: document.title,
    description: document.summary,
    // The canonical URL is the public original when the document is a copy
    // of one (a blog post, the résumé page); otherwise this page is it.
    alternates: { canonical: document.canonical ?? document.url },
    openGraph: {
      title: document.title,
      description: document.summary,
      url: document.url,
      type: 'article',
    },
  }
}

export default async function KnowledgeDocumentPage({
  params,
}: KnowledgeDocumentPageProps) {
  if (isChatDisabled()) notFound()
  const { id } = await params
  const document = readKnowledgeDocument(id)
  if (!document) notFound()

  return (
    <div className="flex min-h-screen items-start justify-center">
      <article className="w-full max-w-3xl px-4 py-12 md:px-8">
        <header className="mb-8">
          <h1
            className="font-bold leading-tight mb-3"
            style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
          >
            {document.title}
          </h1>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-2 items-center">
            <span>{topicLabel(document.topic)}</span>
            <span>&middot;</span>
            <span>
              Updated{' '}
              <time dateTime={document.updated}>
                {formatDate(document.updated)}
              </time>
            </span>
          </div>
          {document.canonical && (
            <p className="text-sm text-muted-foreground mt-3">
              Published at{' '}
              <a
                href={document.canonical}
                className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors"
              >
                {document.canonical.replace(/^https:\/\//, '')}
              </a>
              .
            </p>
          )}
        </header>

        <div className="text-base leading-relaxed">
          <MDXContent source={document.text} />
        </div>

        <footer className="mt-12 pt-6 border-t border-border">
          <Link
            href="/knowledge"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; All knowledge
          </Link>
        </footer>
      </article>
    </div>
  )
}
