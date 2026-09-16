import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { listKnowledgeDocuments } from '@/lib/knowledge'
import { topicLabel } from './topic-label'

// See app/ask/page.tsx: a function so the 404 carries no assistant metadata.
export function generateMetadata(): Metadata {
  if (isChatDisabled()) notFound()
  return {
    title: 'Knowledge',
    description:
      "The documents Matt's Career Assistant reads, published in full. Everything here is public.",
    alternates: { canonical: '/knowledge' },
  }
}

/**
 * The assistant's corpus, on the record.
 *
 * The assistant answers from these documents and nothing else, so
 * publishing them is what makes its answers checkable: anyone can read the
 * source it was working from. The list is generated from the same loader
 * the chat route uses, so a document the assistant can read is a document
 * this page shows, by construction.
 */
export default function KnowledgePage() {
  // These pages exist to make the assistant checkable; killed, they would
  // describe a feature that is not there.
  if (isChatDisabled()) notFound()
  const documents = listKnowledgeDocuments()
  // Documents arrive in index order — topics in their documented order,
  // newest first inside a topic — so grouping in one pass preserves it.
  const topics: { topic: string; documents: typeof documents }[] = []
  for (const document of documents) {
    const group = topics.at(-1)
    if (group?.topic === document.topic) group.documents.push(document)
    else topics.push({ topic: document.topic, documents: [document] })
  }

  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-12 md:px-8">
        <h1
          className="font-bold mb-4"
          style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
        >
          Knowledge
        </h1>
        <p className="text-muted-foreground mb-10 max-w-2xl leading-relaxed">
          The documents Matt&rsquo;s Career Assistant reads. Everything here is
          public.
        </p>

        {topics.map(group => (
          <section key={group.topic} className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              {topicLabel(group.topic)}
            </h2>
            <ul className="space-y-6">
              {group.documents.map(document => (
                <li key={document.id}>
                  <h3 className="text-lg font-semibold leading-tight">
                    <Link
                      href={document.url}
                      className="hover:text-muted-foreground transition-colors"
                    >
                      {document.title}
                    </Link>
                  </h3>
                  <p className="text-muted-foreground mt-1 leading-relaxed">
                    {document.summary}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
