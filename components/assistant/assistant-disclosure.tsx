import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MATT_MAILTO } from './copy'

/**
 * The required disclosure under the input: what the answers are, and the two
 * ways to check them — the sources the answer links, or Matt himself.
 *
 * "Conversations aren't saved" is a statement about the whole system, not a
 * nicety: nothing about a conversation is written down on the server, and the
 * transcript lives only until the tab is closed.
 */
export function AssistantDisclosure({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'space-y-0.5 text-sm leading-snug text-muted-foreground',
        className
      )}
    >
      <p>
        AI-generated. May be incomplete or wrong. Check the linked sources, or{' '}
        <Link
          className="underline underline-offset-2 hover:text-foreground"
          href={MATT_MAILTO}
        >
          email Matt
        </Link>
        .
      </p>
      <p>Conversations aren&rsquo;t saved.</p>
    </div>
  )
}
