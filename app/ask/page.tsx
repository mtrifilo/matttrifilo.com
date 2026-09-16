import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isChatDisabled } from '@/lib/chat/kill-switch'
import { AssistantChat } from '@/components/assistant/assistant-chat'

export const metadata: Metadata = {
  title: 'Ask',
  description:
    "Matt's Career Assistant answers questions about Matt Trifilo's projects, teams and engineering leadership, from his published work, and links the documents it used.",
  alternates: { canonical: '/ask' },
}

/**
 * Matt's Career Assistant (MTC-33).
 *
 * The page is a shell: everything below the metadata is a client component,
 * because a conversation that is never stored has nothing for the server to
 * render. What the assistant may say, and what it may read to say it, is
 * decided entirely in app/api/chat and lib/chat.
 */
export default function AskPage() {
  // The kill switch hides the page, not just the route behind it: a page
  // whose every question is refused is worse than no page.
  if (isChatDisabled()) notFound()
  return <AssistantChat />
}
