---
id: documentation-and-knowledge-sharing
title: Documentation, runbooks, and hiring materials, 2018 to 2025
summary: A seven-year habit of writing the fix down rather than leaving it as tribal knowledge: wikis, interview questions, and runbooks.
tags: [documentation, runbooks, hiring, knowledge-sharing, craft]
updated: 2026-09-21
---

# Documentation, runbooks, and hiring materials, 2018 to 2025

## What this is

Not a project with one problem statement, but a recurring pattern of small,
self-initiated documentation tasks, each closing a narrow, concrete gap at
the time. **Six ticket-linked pull requests** between May 2018 and January
2025, adding 521 lines and removing two, across four repositories: the
engineering handbook (3), the monolith, the compliance service, and the
email data service. All six tickets resolved the same day or within about a
week of being opened, which is the shape of quick, self-contained fixes
rather than multi-step projects. The span covers nearly Matt's entire
career timeline, from Software Engineer I through manager.

## The four gaps, and what he wrote

**2018, onboarding friction.** The monolith's wiki had no easy way for a
new engineer to find the troubleshooting page for common installation and
runtime errors. Matt wrote the troubleshooting page, seeded it from the
team's existing notes, and linked it from the README.

**2022, hiring.** The team needed new front-end interview content because,
per the ticket, the company needed to hire front-end engineers at the
junior and mid levels. Matt authored three coding challenges and their
answer keys directly in the shared engineering handbook, plus an initial
set of question-and-answer items for candidates at those levels.

**2023, operability.** He updated the compliance service's README with the
request commands needed to manually exercise the system against each
environment, plus the access prerequisites. That is the kind of detail that
otherwise lives in one person's shell history.

**2025, a single point of failure.** Ahead of a known gap in pipeline
coverage, Matt recorded a walkthrough video of the transformation tooling
and linked it from the data service's runbook, specifically so an on-call
operator unfamiliar with the tooling or the warehouse could triage the most
common alert.

## What it is honest about

- **No adoption or effectiveness metrics exist.** There is nothing showing
  whether the 2022 interview questions were used in real candidate loops,
  how candidates performed on them, or whether the later runbook work
  measurably reduced time-to-resolution or dependency on one teammate.
- **This is a thin, opportunistic sample, not a complete record.** Six
  tickets over seven years almost certainly undercounts the real
  documentation work, which includes wiki pages, decision logs, research
  spikes, and runbooks that never carried a ticket. Treat it as
  illustrative of a habit rather than as the full inventory.
- The 2025 runbook update was explicitly a stopgap, "until the runbook can
  be more thoroughly expanded," tied to a specific coverage gap rather than
  a general on-call improvement programme.

## Where the habit went next

The same instinct, at much larger scale, produced the on-call knowledge
base (98 incident documents, permanent runbooks, an alert routing table,
under a standing rule that every alert produces a permanent runbook), the
decision logs kept in every 2026 project folder, and the subject-matter
plugin system that promotes lessons learned in tickets into
a knowledge base agents can load. His 2025 leadership-programme capstone
argued the same case formally: knowledge is a single point of failure, and
the fix is documenting the *why*, pairing experts with a second engineer,
and naming who can take ownership gradually.

## How he describes it

Matt has written:

> Across my career I've made a habit of writing down the fix the moment I
> find a gap, rather than letting it stay tribal knowledge. Early on, that
> meant building a troubleshooting page for a monolith's most common setup
> errors. Later, as a team lead, it meant writing new technical interview
> questions when we needed to scale up hiring, and, more recently,
> recording a walkthrough video and updating a runbook so that one person's
> knowledge wouldn't become a single point of failure for on-call triage.
> None of these are individually large projects, but they're a consistent
> pattern of turning "ask the one person who knows" into "read the doc."
