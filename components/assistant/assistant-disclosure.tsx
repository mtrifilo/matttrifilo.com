'use client'

import Link from 'next/link'
import { FOCUS_RING } from '@/lib/focus-ring'
import { cn } from '@/lib/utils'
import { ASSISTANT_EVALS_TITLE, MATT_MAILTO } from './copy'
import { useEvalsPublished } from './evals-published'

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
 * The link to the published eval results is offered only when a run has
 * been published, because a link to a page that can only say "no published
 * run yet" is worse than no link. Whether one has been is filesystem
 * knowledge, and this renders in the browser, so the server pages provide
 * it through ./evals-published.
 */
const LINK_CLASS = cn(
  'underline underline-offset-2 hover:text-foreground',
  FOCUS_RING
)

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
        <Link className={LINK_CLASS} href={MATT_MAILTO}>
          Matt himself
        </Link>
        .
      </p>
      <p>Conversations aren&rsquo;t saved.</p>
      {evalsPublished && (
        <p>
          {/* On a line of its own, so not a link inside a sentence: it
              takes the 44 px hit area the other small controls have. */}
          <Link
            className={cn(LINK_CLASS, 'touch-target relative')}
            href="/ask/evals"
          >
            {ASSISTANT_EVALS_TITLE}
          </Link>
        </p>
      )}
    </div>
  )
}
