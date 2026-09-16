---
id: talks-and-teaching
title: Talks, teaching, and technical writing
summary: A seven-year internal speaking habit, from a 2019 architecture talk to three 2026 brown bags on agentic engineering, and the materials.
tags: [talks, teaching, enablement, agentic-engineering, communication]
updated: 2026-09-15
---

# Talks, teaching, and technical writing

Matt has been giving internal technical talks since 2019 or 2020. It is a
seven-year habit, not a 2026 one.

## The talks

| When | Title | Shape |
|---|---|---|
| 2019 or 2020 | Backend-for-frontend layers and GraphQL | The history and the pattern, drawn from how the large streaming and social companies arrived at it |
| July 2025 | "Hacking to the Future with Cursor" | A lunch-and-learn balancing educational background with a hands-on demo |
| February 2026 | "Agentic Engineering in 2026" | Originally titled "Coding Agents: Is this the end of writing code by hand?" |
| May 2026 | "Effective Context Management for AI Agents" | 42 minutes, six interactive teaching artifacts |
| August 2026 | "Advanced Context Engineering: Give your agent a brain" | Building plugins that give agents a knowledge base persisting across sessions |
| April 2026 | AI guild demo | |
| Summer 2026 | Weekly developer-experience demo series | Recurring presenter |

## The May 2026 talk, in detail

The thesis is one sentence: **frontier context windows are now around a
million tokens, but the engineering skill that matters is what you put in
the window, not how big the window is.** Quality of context beats quantity.

Behind the talk sit four research documents, each written to stand alone so
an engineer who reads only one still gets a complete argument:

1. **How LLMs build and use the context window:** tokenisation, embeddings,
   attention, the key-value cache, positional encoding, prefill versus
   decode, and where context actually lives in a real agent harness.
2. **Why context windows expanded:** the five-year arc from two thousand
   tokens to more than a million, and the specific techniques that made it
   possible.
3. **Why context cannot be infinite:** quadratic prefill cost, key-value
   cache memory, the lost-in-the-middle effect, training-data scarcity, and
   economics. Why "infinite context" is not around the corner.
4. **Current model specifications and pricing** as a reference, so
   engineers know what they are paying for.

And six self-contained interactive artifacts, each one HTML file with
inline styling and plain JavaScript, no build step and no external
dependencies, so they work offline and are safe to run live in a talk:

- a **multimodal token primer** showing text becoming byte-pair tokens with
  animated merges, images becoming patches, audio becoming frames, and
  video becoming tubelets, the "everything becomes tokens" idea made
  visible;
- a **tokeniser visualiser**, paste text and see how it tokenises;
- a **context-budget visualiser** breaking a window into system prompt,
  tool definitions, history, file reads, and output, so budgets stop being
  abstract;
- a **context-layers walkthrough** showing how an agent's context builds up,
  foundation first then conversation turns, including a continue-session
  versus fresh-session bloat demonstration;
- a **scaling chart** plotting quadratic attention cost and linear cache
  growth against context length;
- a **context-window comparison** timeline from 2019 to 2026.

Matt's stated style rules for the research documents are worth recording as
a writing standard: cross-references are explicit; sources are cited inline
with a sources section per document; numbers come from official vendor
documentation, primary papers, or named third-party benchmarks; anything
that is an estimate or a rule of thumb is flagged as such; the audience is
senior software engineers, not machine-learning researchers; and the maths
is included only where it pays for itself.

A colleague asked for the demo files the same day the talk was given.

## The weekly demo series

Through summer 2026 Matt was a recurring presenter, demonstrating the
security-fix skill, adversarial review, the subject-matter-expert plugin
scaffold, the team marketplace, and the autonomous remediation harness and
its learnings. One service's independent-deployment epic was generated live
during a July demo. Feedback after the May session was that the
demo-plus-office-hours format was what developers wanted.

## Written evaluations and proposals

Teaching is not only talks. The written record includes:

- a structured programme evaluating a third-party coding agent, with trial
  questions and participants, two weekly check-in notes, and a survey,
  concluding against purchase;
- an LLM evaluation-framework proposal, local eval tooling first with
  managed evaluation later;
- testing-workflow proof-of-concept notes written with peers elsewhere in
  the organisation, covering independent deployment and agent-written
  tests;
- an AI-champions-per-team adoption proposal pitched to senior leadership;
- a research-spike summary for an AI feature, written with an explicit
  throw-it-away criterion.

He also packaged a shareable pack of connector skills for internal data
access, with installation steps, per-skill prerequisites, example prompts,
and a troubleshooting section, for engineers who were not on his team.

## Learning inputs

- Completed a course on taking AI agents from prototype to production
  (2025).
- Attended a GraphQL conference (2025) and shared the learnings back with
  the organisation alongside a colleague, using them to guide early AI
  agent implementation.
- Taught himself business-case writing in 2026, cost to build, cost to
  maintain, estimated return, and competitive analysis, with an AI
  assistant as the tutor.
- A standing habit of reading industry practitioners and research and
  routing what matters back into the organisation's channels.

## The open items he names

Two blog posts and a first meetup talk outside the company were committed
to and have not been started; the two context talks are ready to adapt for
a meetup and a conference call for papers. He tracks these as unfinished
rather than implying they happened.
