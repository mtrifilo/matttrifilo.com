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

import type { FeaturedThemeKey } from '@/lib/chat/featuring'
import type { ChatProgressTopic } from '@/lib/chat/progress'

export const MATT_EMAIL = 'matt.trifilo@gmail.com'
export const MATT_MAILTO = `mailto:${MATT_EMAIL}`

export const ASSISTANT_NAME = "Matt's Career Assistant"

/** The persistent AI disclosure. Present on every surface, never dismissible. */
export const ASSISTANT_LABEL = 'AI assistant · answers about Matt Trifilo'

export const ASSISTANT_INTRO =
  "Ask about Matt's projects, teams, and engineering leadership. Answers come from his published work — email him if you want to talk."

export const ASSISTANT_PLACEHOLDER = "Ask about Matt's work…"

/**
 * The published eval results. One string for three places that must agree:
 * the line under the chat pane, the page's own heading and title, and the
 * sitemap entry in lib/site-routes.ts.
 */
export const ASSISTANT_EVALS_TITLE = 'How this assistant is tested'

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
 * and evals/suites/golden.yaml is the only place that is measured. Each
 * entry needs a golden whose vars.question is this exact string; a golden on
 * the same subject in other words does not prove the wording in the pill
 * works. evals/config.test.ts fails `bun test` and names any entry that has
 * none, so adding a question here means adding its golden in the same
 * change.
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
  // Symphony is OpenAI's open-source project; Matt adapted it (MTC-66).
  'What is Symphony, and what did Matt do with it?',
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
 * How many pills of each ticker row count as the head of the pool: what the
 * homepage shows first, since it opens each row on its first pill.
 */
export const STARTER_HEAD_PILLS_PER_ROW = 4

type StarterQuestion = (typeof STARTER_QUESTIONS)[number]

/**
 * The head questions that clearly belong to one of the featured themes in
 * lib/chat/featuring.ts, keyed by the question so a reorder carries its
 * theme with it. copy.test.ts fails unless every theme is tagged, and every
 * tagged question sits in the head.
 *
 * Only clear matches are tagged. Whether the other head questions (Matt's
 * use of AI coding agents, quality with agents, the code he ships himself,
 * what he shipped recently) belong to a theme is Matt's taxonomy to decide,
 * so they are left out rather than guessed.
 *
 * The pool's order does not follow the featuring order. It is the order Matt
 * approved, and whether to reorder it is his decision in MTC-76, so the test
 * checks that the head covers the themes, not their order.
 */
export const STARTER_HEAD_THEMES: Partial<
  Record<StarterQuestion, FeaturedThemeKey>
> = {
  "How did Matt roll out AI tooling and best practices across Thryv's engineering org?":
    'orgAiAdoption',
  "What measurable results did Matt's team get from adopting AI coding agents?":
    'measuredDelivery',
  "What does Matt's Email Reliability team own at Thryv?":
    'operationalOwnership',
  'What is the AI Email Engagement Summary feature Matt built?':
    'productOutcomes',
}

/**
 * The starter question about the table-stakes practice in
 * lib/chat/featuring.ts. It is supporting detail, never a headline, so
 * copy.test.ts holds it outside the head.
 */
export const STARTER_TABLE_STAKES_QUESTION: StarterQuestion =
  "How did Matt's team move to independent deploys, and how long did it take?"

/**
 * The control that empties the transcript. Two of the route's refusals tell
 * the visitor to "start a new one", and this is the thing they mean.
 */
export const RESET_LABEL = 'New conversation'

/**
 * The group a screen reader names before the row of proposed next questions
 * (MTC-41).
 *
 * It says "follow-up" rather than "suggested" because that is what the row
 * is: questions that follow from the answer just given, not a menu the
 * assistant would have offered anyway.
 */
export const FOLLOW_UPS_LABEL = 'Follow-up questions'

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
 * and a clever phrase wears out fast. Nothing here names a model or a step
 * count the run did not actually reach.
 *
 * The tool is named, in the one line most visitors see (MTC-50): the panel
 * is shut by default, so the collapsed summary is where "this is a harness
 * reading a corpus" has to be legible without a click.
 */

/** Before the first read: the model is still choosing what to open. */
export const PROGRESS_THINKING = 'Thinking…'

/**
 * The reading tool, spelled for the visitor exactly as the route registers
 * it. `copy.test.ts` compares it against READ_DOCUMENT_TOOL_NAME in
 * lib/chat/prompt.ts, which this file may not import: that module builds the
 * system prompt off the knowledge index, which reads the filesystem.
 */
export const PROGRESS_TOOL_NAME = 'read_document'

/**
 * One line per document, titled from the server's index, never the model.
 *
 * `announcementFor` in lib/chat/answer.ts speaks the same two things to a
 * screen reader, without the ellipsis, from its own literals: that module is
 * where the announcement strings live and it cannot import this one. Change
 * the verb here and change it there.
 */
export const progressReading = (title: string) => `Reading ${title}…`

/**
 * One line per repository the assistant checks on GitHub (MTC-45), named from
 * the server's allowlist, never from the model.
 *
 * It says GitHub rather than "the repository" because the visitor is being
 * told why this step took a second or two: the answer went outside the site
 * for it, and that is worth saying plainly.
 *
 * `announcementFor` in lib/chat/answer.ts speaks the same line without the
 * ellipsis, from its own literal. Change the verb here and change it there.
 */
export const progressChecking = (name: string) => `Checking GitHub for ${name}…`

/**
 * The corpus topic of a read, as the expanded row shows it (MTC-50).
 *
 * It is the answer to "which part of his material is this?", so a hiring
 * manager can see that a claim came from the résumé rather than from a blog
 * post. The record is keyed by the closed set the progress wire validates
 * against, so a topic added there without a label here fails typecheck.
 */
const PROGRESS_TOPIC_LABELS: Record<ChatProgressTopic, string> = {
  resume: 'Résumé',
  career: 'Career',
  faq: 'FAQ',
  'open-source': 'Open source',
  blog: 'Blog',
}

export const progressTopic = (topic: ChatProgressTopic): string =>
  PROGRESS_TOPIC_LABELS[topic]

/**
 * A document's section titles under its row, in the order the document has
 * them. The whole document was read, so the whole outline is shown; a
 * shortened list would invite the reading that only those parts were opened.
 */
export const progressHeadings = (headings: readonly string[]): string =>
  headings.join(' · ')

/** The last step: the reading is done and the answer is being written. */
export const PROGRESS_WRITING = 'Writing answer…'

/**
 * The header line of a run that ended without an answer. It replaces the
 * status the header would otherwise show; the step that was in flight keeps
 * its own label and changes only its icon. The timer beside it is frozen,
 * and no count is claimed.
 */
export const PROGRESS_STOPPED = 'Stopped'

/**
 * The collapsed line above a finished answer. Only ever shown truthfully.
 *
 * The reading clause names the tool (Matt's wording, 2026-09-22): most
 * visitors never open the panel, so this line is the only place the harness
 * is visible. "sources" rather than "documents" because it is what the tool
 * call did, and a source is what a hiring manager is looking for.
 *
 * Documents and GitHub checks are counted apart because they are different
 * work, and calling one the other in the line that stands in for the whole
 * run would be the sort of small inaccuracy this view exists to avoid. The
 * checks are not numbered: "checked GitHub" is true of one repository or
 * three, and a visitor is being told where the answer came from, not how many
 * requests it took.
 *
 * `progressTotals` only produces totals for a run with at least one step, so
 * one of the two counts is always above zero.
 */
export const progressSummary = (
  documents: number,
  activity: number,
  seconds: number
) => {
  const parts: string[] = []
  if (documents > 0) {
    parts.push(
      `Used ${PROGRESS_TOOL_NAME} on ${documents} ${documents === 1 ? 'source' : 'sources'}`
    )
  }
  if (activity > 0)
    parts.push(parts.length > 0 ? 'checked GitHub' : 'Checked GitHub')
  return `${parts.join(' and ')} in ${seconds}s`
}

/**
 * The header above the steps of a run that finished without writing an
 * answer. It names the disclosure without claiming that the reading produced
 * anything, which the summary line above an empty reply would.
 */
export const PROGRESS_UNFINISHED = 'Steps taken'
