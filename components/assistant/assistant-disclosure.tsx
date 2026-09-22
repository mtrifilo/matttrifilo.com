'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MATT_MAILTO } from './copy'
import { useEvalsPublished } from './evals-published'

/** Matt's copy, like the two sentences above it. */
const EVALS_LINK_LABEL = 'How this assistant is tested'

/**
 * The required disclosure under the input: what the answers are, and who to
 * ask when it matters.
 *
 * Nothing serves a corpus document, so Matt is the only check this page can
 * honestly offer. Each answer names the documents it read, by title, above
 * the text, but that is a record of what the answer drew on rather than
 * something a visitor can open, so the disclosure does not send them to it.
 *
 * "Conversations aren't saved" is a statement about the whole system, not a
 * nicety: nothing about a conversation is written down on the server, and the
 * transcript lives only until the tab is closed.
 *
 * The third line is the published eval results (MTC-44). It appears only
 * when a run has been published, because a link to a page that can only say
 * "no published run yet" is worse than no link.
 */
export function AssistantDisclosure({ className }: { className?: string }) {
  const evalsPublished = useEvalsPublished()

  return (
    <div
      className={cn(
        'space-y-0.5 text-sm leading-snug text-muted-foreground',
        className
      )}
    >
      <p>
        AI-generated. May be incomplete or wrong. Check anything that matters
        with{' '}
        <Link
          className="underline underline-offset-2 hover:text-foreground"
          href={MATT_MAILTO}
        >
          Matt himself
        </Link>
        .
      </p>
      <p>Conversations aren&rsquo;t saved.</p>
      {evalsPublished && (
        <p>
          <Link
            className="underline underline-offset-2 hover:text-foreground"
            href="/ask/evals"
          >
            {EVALS_LINK_LABEL}
          </Link>
        </p>
      )}
    </div>
  )
}
