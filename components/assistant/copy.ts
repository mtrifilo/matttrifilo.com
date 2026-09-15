/**
 * The sentences Matt's Career Assistant puts on the page from its components
 * (MTC-33).
 *
 * It is one file because the framing is the constraint: the assistant is
 * always a third party talking *about* Matt, never Matt, and that is easier to
 * hold to when every line is readable together. Two kinds of copy live
 * elsewhere on purpose: the route's own — the refusals, the limits, the kill
 * switch — which the UI renders as sent; and the error fallback in
 * lib/chat/answer.ts, which is decided alongside the parsing it covers.
 */

export const MATT_EMAIL = 'matt.trifilo@gmail.com'
export const MATT_MAILTO = `mailto:${MATT_EMAIL}`

export const ASSISTANT_NAME = "Matt's Career Assistant"

/** The persistent AI disclosure. Present on every surface, never dismissible. */
export const ASSISTANT_LABEL = 'AI assistant · answers about Matt Trifilo'

export const ASSISTANT_INTRO =
  "I'm an AI assistant for Matt Trifilo's site. Ask me about his projects, teams, or engineering leadership."

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
 * The one error the UI writes itself. MTC-34 owns the limiter and will send
 * its own sentence, but a visitor who has just run out of questions is the one
 * visitor for whom the static pages beat the assistant, so the links matter
 * more than whatever prose arrives with the 429.
 */
export const RATE_LIMIT_NOTICE = {
  lead: "You've reached the limit for now. Matt's ",
  resumeLabel: 'résumé',
  between: ' and ',
  knowledgeLabel: 'project pages',
  after: ' are one click away, or ',
  emailLabel: 'email him directly',
  end: '.',
} as const
