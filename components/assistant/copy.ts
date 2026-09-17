/**
 * The assistant-voice copy of Matt's Career Assistant: the name, the
 * introduction, the starter questions, the notices (MTC-33).
 *
 * It is one file because the framing is the constraint: the assistant is
 * always a third party talking *about* Matt, never Matt, and that is easier to
 * hold to when every line is readable together. It is not every string the
 * components render — labels, the disclosure paragraph and the composer's
 * hints sit with their markup — and two kinds of copy live elsewhere on
 * purpose: the route's own, which the UI renders as sent, and the error
 * fallback in lib/chat/answer.ts, decided alongside the parsing it covers.
 */

export const MATT_EMAIL = 'matt.trifilo@gmail.com'
export const MATT_MAILTO = `mailto:${MATT_EMAIL}`

export const ASSISTANT_NAME = "Matt's Career Assistant"

/** The persistent AI disclosure. Present on every surface, never dismissible. */
export const ASSISTANT_LABEL = 'AI assistant · answers about Matt Trifilo'

export const ASSISTANT_INTRO =
  "Ask about Matt's projects, teams, and engineering leadership. Answers come from his published work — email him if you want to talk."

export const ASSISTANT_PLACEHOLDER = "Ask about Matt's work…"

/**
 * Starter questions. The homepage panel offers short ones that fit a card;
 * /ask has room for the fuller questions the assistant answers best.
 */
export const HOME_STARTER_QUESTIONS = [
  "What does Matt's team own?",
  'How does he use AI coding agents?',
  'What did he ship recently?',
] as const

export const ASK_STARTER_QUESTIONS = [
  'What did Matt actually do on the AI Email Engagement Summary?',
  "How did his team's delivery change after adopting AI coding agents?",
  'What does the Email Reliability team own at Thryv?',
] as const

/**
 * The control that empties the transcript. Two of the route's refusals tell
 * the visitor to "start a new one", and this is the thing they mean.
 */
export const RESET_LABEL = 'New conversation'

/** Shown under an answer the model started but the output cap cut off. */
export const TRUNCATED_NOTICE =
  'That answer was cut short. Ask a narrower question and the assistant can finish it.'

/** Shown when a run ended with no answer at all. */
export const INCOMPLETE_NOTICE =
  "The assistant couldn't finish that one. Try asking again."

/**
 * The one error the UI writes itself. The route sends its own sentence with
 * the 429, but a visitor who has just run out of questions is the one visitor
 * for whom the static pages beat the assistant, so the links matter more than
 * whatever prose arrives with it.
 */
export const RATE_LIMIT_NOTICE = {
  lead: "You've reached the limit for now. Matt's ",
  resumeLabel: 'résumé',
  between: ' is one click away, or ',
  emailLabel: 'email him directly',
  end: '.',
} as const

/*
 * The in-progress view: what the assistant says it is doing while the
 * visitor waits, and what it says it did once the answer is there (MTC-42).
 *
 * These are Matt's to change, like every other line in this file. They are
 * deliberately plain: the visitor is reading them for ten to twenty seconds
 * and a clever phrase wears out fast. Nothing here names a model, a tool or
 * a step count the run did not actually reach.
 */

/** Before the first read: the model is still choosing what to open. */
export const PROGRESS_THINKING = 'Thinking…'

/**
 * One line per document, titled from the server's index, never the model.
 *
 * `announcementFor` in lib/chat/answer.ts speaks the same two things to a
 * screen reader, without the ellipsis, from its own literals: that module is
 * where the announcement strings live and it cannot import this one. Change
 * the verb here and change it there.
 */
export const progressReading = (title: string) => `Reading ${title}…`

/** The last step: the reading is done and the answer is being written. */
export const PROGRESS_WRITING = 'Writing answer…'

/**
 * The header line of a run that ended without an answer. It replaces the
 * status the header would otherwise show; the step that was in flight keeps
 * its own label and changes only its icon. The timer beside it is frozen,
 * and no count is claimed.
 */
export const PROGRESS_STOPPED = 'Stopped'

/** The collapsed line above a finished answer. Only ever shown truthfully. */
export const progressSummary = (count: number, seconds: number) =>
  `Read ${count} ${count === 1 ? 'document' : 'documents'} in ${seconds}s`

/**
 * The header above the steps of a run that finished without writing an
 * answer. It names the disclosure without claiming that the reading produced
 * anything, which "Read 3 documents in 14s" over an empty reply would.
 */
export const PROGRESS_UNFINISHED = 'Steps taken'
