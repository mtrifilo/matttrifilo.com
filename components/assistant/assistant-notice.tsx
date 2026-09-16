import Link from 'next/link'
import { AlertCircle, Clock, Scissors } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ChatErrorView } from '@/lib/chat/answer'
import { cn } from '@/lib/utils'
import {
  INCOMPLETE_NOTICE,
  MATT_MAILTO,
  RATE_LIMIT_NOTICE,
  RESET_LABEL,
  TRUNCATED_NOTICE,
} from './copy'

/**
 * The small bordered lines that say something about an answer rather than
 * being one (MTC-33): it was cut short, it never finished, or it could not be
 * asked at all.
 *
 * They are deliberately not assistant messages. An answer is what the model
 * drew from the documents; these are what this site knows about the request,
 * and mixing the two would let a limit or a failure read as something Matt's
 * corpus said.
 */

function Notice({
  children,
  className,
  icon,
  role,
  tone = 'muted',
}: {
  children: ReactNode
  className?: string
  icon: ReactNode
  role?: 'alert'
  tone?: 'muted' | 'destructive'
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3',
        'text-sm leading-relaxed',
        tone === 'destructive' ? 'text-foreground' : 'text-muted-foreground',
        className
      )}
      role={role}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 shrink-0',
          tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** An answer that stopped mid-sentence on the model's output cap. */
export function TruncatedNotice() {
  return (
    <Notice icon={<Scissors className="size-4" />}>{TRUNCATED_NOTICE}</Notice>
  )
}

/** A run that ended without producing an answer at all. */
export function IncompleteNotice() {
  return (
    <Notice icon={<AlertCircle className="size-4" />}>
      {INCOMPLETE_NOTICE}
    </Notice>
  )
}

/**
 * Whatever went wrong, in the server's own words.
 *
 * Every code but one renders the sentence the route sent, because the route is
 * what knows why it refused. `rate_limited` is the exception: a visitor out of
 * questions needs somewhere to go, so the notice hands them the two pages that
 * answer most of what they were asking and Matt's address for the rest.
 *
 * Three refusals are about the conversation rather than the assistant —
 * the turn limit, the token budget, and a body the route could not read,
 * which can be the replayed history rather than the question — so those
 * carry the control that starts a new one, when there is one to leave. The
 * rest are about the assistant, and a retry is the right next step.
 *
 * The status region announces only "Error"; `role="alert"` here is what reads
 * the sentence itself to a screen reader.
 */
export function ChatErrorNotice({
  error,
  onReset,
}: {
  error: ChatErrorView
  onReset?: () => void
}) {
  if (error.code === 'rate_limited') {
    return (
      <Notice icon={<Clock className="size-4" />} role="alert">
        {RATE_LIMIT_NOTICE.lead}
        <NoticeLink href="/resume">{RATE_LIMIT_NOTICE.resumeLabel}</NoticeLink>
        {RATE_LIMIT_NOTICE.between}
        <NoticeLink href={MATT_MAILTO}>
          {RATE_LIMIT_NOTICE.emailLabel}
        </NoticeLink>
        {RATE_LIMIT_NOTICE.end}
      </Notice>
    )
  }

  const offersReset =
    onReset &&
    (error.code === 'too_many_turns' ||
      error.code === 'budget_exceeded' ||
      error.code === 'invalid')

  return (
    <Notice
      icon={<AlertCircle className="size-4" />}
      role="alert"
      tone="destructive"
    >
      {error.message}
      {offersReset && (
        <button
          className="ml-2 font-medium underline underline-offset-2 hover:text-primary"
          onClick={onReset}
          type="button"
        >
          {RESET_LABEL}
        </button>
      )}
    </Notice>
  )
}

function NoticeLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="text-foreground underline underline-offset-2 hover:text-primary"
      href={href}
    >
      {children}
    </Link>
  )
}
