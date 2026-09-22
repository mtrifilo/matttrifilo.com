---
name: career-assistant-context
description: Load before any work on Matt's Career Assistant (the chat, its corpus, starter questions, copy, evals, or answer rubrics). Who the reader is, what to lead with, the persona rules, and the standing constraints.
---

# Career Assistant context

Read these, in order, before changing anything the assistant says or shows:

1. The user-level `research-docs` skill, then `~/docs/research/hiring/hiring-audience-2026.md`: who the reader is, what hiring managers and recruiters screen a hands-on engineering manager for in 2026, and what that means for the assistant. Private, refreshed each quarter, cited by path and date, never copied here. **Without access to it, do not guess the audience: the reader and the featuring order below are the minimum, and anything beyond them is a question for Matt.**
2. `docs/career-assistant-operations.md`: the layers of protection, the kill switch, how and when the eval suites run, and the runbook.
3. The Linear project "Ask Matt AI chat" (team MTC): the ticket for the work, with its comments. Decisions live there as dated "binding" comments. Linear is the source of truth for progress; work with no ticket gets one first.

## Rules that do not change without Matt's word

- **The reader** is a hiring manager or recruiter deciding whether to talk to Matt about a hands-on engineering-manager role. Every visible string and every rubric is written for that person.
- **Persona.** The assistant is "Matt's Career Assistant", a third party talking about Matt. It never speaks as Matt. First person appears only inside block quotes introduced as his own words.
- **Lead with what was unusually impactful, in this order** (Matt, 2026-09-22; this skill is the authoritative copy of the order, and the private research document defers to it): the measured delivery change from AI adoption (with the confounders), product and platform outcomes, operational ownership at scale, leading AI adoption across the organisation. Practices most companies already have, independent deployment among them, are supporting detail, never a headline.
- **Answers are briefings**: a lead sentence a hiring manager could forward, then dated evidence from the documents. No inferred characterisation presented as documented.
- **Index summaries describe what a document is.** Never plant a phrase to route an eval question; fix the golden's expected reads instead.
- **Copy is Matt's.** A new visitor-visible string is marked as his to change in the pull request.
- **Corpus.** Documents come from Matt's private drafts under his verbatim-first rubric (copy verbatim; remove only sensitive material, employer IP, and per-person data about others). The repository is public, so a corpus change gets a fresh-context privacy review before any push, and `scripts/knowledge-denylist-check.sh` runs before the push (it is silent without its denylist file, so an OK there is not proof). Nothing about a visitor is stored.
- **Evals** run locally, never in CI on pull requests. When a change requires a run, and how to run one, is the "Eval suites" section of `docs/career-assistant-operations.md`; follow that list rather than a paraphrase of it, and paste the summary table in the PR. Every starter question must have a golden: until MTC-51 (PR #33) lands its enforcing test, that is a manual check, so a new starter question and its golden ship in the same PR.
- **Production stays off** (`CHAT_DISABLED=1`, set 2026-09-15; `vercel env ls production` is the source of truth) until the launch checklist in MTC-35 is done. Never change Vercel environment variables or deploy to production for chat work. Never run `next dev`, `next build`, or `next start` from an agent.
- **Review.** Adversarial review before every pull request, fixes in their own commits, findings in the PR body.
