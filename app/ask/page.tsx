import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { hasPublishedEvalRun } from '@/lib/evals/results'
import { AssistantChat } from '@/components/assistant/assistant-chat'
import { EvalsPublishedProvider } from '@/components/assistant/evals-published'

// A function, not a constant: a static `metadata` export resolves even when
// the page throws notFound(), so the 404 would still carry this title,
// description and a self-canonical. Throwing here is what makes Next resolve
// the not-found metadata instead.
export function generateMetadata(): Metadata {
  if (isChatDisabled()) notFound()
  return {
    title: 'Ask',
    description:
      "Matt's Career Assistant answers questions about Matt Trifilo's projects, teams and engineering leadership, from his own documents, and says which ones it read.",
    alternates: { canonical: '/ask' },
  }
}

/**
 * Matt's Career Assistant (MTC-33).
 *
 * The page is a shell: everything below the metadata is a client component,
 * because a conversation that is never stored has nothing for the server to
 * render. What the assistant may say, and what it may read to say it, is
 * decided entirely in app/api/chat and lib/chat.
 *
 * The one thing the server does render into it is whether an eval run has
 * been published, which the disclosure under the composer needs and cannot
 * read for itself from the browser (MTC-44).
 */
export default function AskPage() {
  // The kill switch hides the page, not just the route behind it: a page
  // whose every question is refused is worse than no page.
  if (isChatDisabled()) notFound()
  return (
    <EvalsPublishedProvider published={hasPublishedEvalRun()}>
      <AssistantChat />
    </EvalsPublishedProvider>
  )
}
