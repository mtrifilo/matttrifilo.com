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
 * The starter questions both surfaces offer (MTC-39).
 *
 * One pool, one order, shown by the ticker on the homepage panel and at
 * /ask. The order is the product decision: the questions a hiring manager
 * most wants answered lead, then the depth, then the person. Nothing here is
 * shuffled per load, so the two surfaces stay hydratable and a visitor who
 * came from the homepage meets a different part of the row at /ask only
 * because the ticker starts it at a different offset.
 *
 * Every question here has to draw a sourced answer rather than a decline,
 * and evals/suites/golden.yaml is the only place that is measured. Its
 * coverage of this pool is partial: the second tranche has a golden each,
 * most of the first tranche is covered by a golden on the same subject, and
 * a handful are not covered at all. Nothing enforces the correspondence, so
 * a question added here needs its golden added by hand.
 *
 * The cap in copy.test.ts is the pill's constraint, not a style rule: the
 * ticker renders each question on one line, so a longer one would widen the
 * row past what a 390px screen can read.
 */
export const STARTER_QUESTIONS = [
  'How does Matt use AI coding agents?',
  "How did Matt roll out AI tooling and best practices across Thryv's engineering org?",
  "What measurable results did Matt's team get from adopting AI coding agents?",
  'How does Matt keep quality high when AI agents write most of the code?',
  'How much code does Matt ship himself as an engineering manager?',
  "What does Matt's Email Reliability team own at Thryv?",
  'What did Matt ship recently?',
  'What is the AI Email Engagement Summary feature Matt built?',
  'What is Symphony, the agent orchestrator Matt built, and what did it automate?',
  "How did Matt's team move to independent deploys, and how long did it take?",
  'How does Matt run 24/7 on-call for an email service provider?',
  'How does Matt prepare email sending for Black Friday and Cyber Monday?',
  'How did Matt handle the February 2024 cloud-provider outage?',
  "What was Matt's part in breaking the Keap monolith into services?",
  "How does Matt think the engineer's job changes when agents write the code?",
  "What is Matt's advice to junior engineers in 2026?",
  'What languages, frameworks, and infrastructure do Matt and his team use?',
  'What is decant, the CLI Matt open-sourced?',
  'What is Psychic Homily, and what is it built with?',
  'What awards and recognition has Matt received?',
  'Where is Matt based, and is he open to relocating?',
  'What did Matt do before software engineering?',
  'How has Matt led a team through an acquisition?',
  'How does Matt manage the cost of AI tooling?',
  'How did Matt handle resistance to AI tools on the team?',
  'What does Matt think good engineering leadership looks like?',
  'How does Matt build a team that keeps running without him?',
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
