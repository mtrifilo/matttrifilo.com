---
id: ai-tooling-leadership
title: AI tooling leadership across the engineering organisation
summary: The talks, demos, forums, skills library, trials, and proposals behind Matt's push for AI-agent adoption across roughly fifty engineers.
tags: [ai, agentic-engineering, claude-code, talks, enablement, leadership]
updated: 2026-09-15
---

# AI tooling leadership across the engineering organisation

A cross-organisation operating system for AI enablement that Matt built and
maintains. In 2026 it matured from evangelism into governed distribution
infrastructure (the plugin marketplaces) and autonomous agents. This
document covers the community layer.

## Talks

Internal talks date back to a 2019 talk on the backend-for-frontend and
GraphQL pattern. The 2026 engineering brown-bag series includes three of
Matt's:

- **February 2026, "Agentic Engineering in 2026,"** originally titled
  "Coding Agents: Is this the end of writing code by hand?"
- **May 2026, "Effective Context Management for AI Agents."** Thesis:
  frontier context windows are now around a million tokens, but the
  engineering skill that matters is what you put in the window, not how big
  the window is. A 42-minute talk with six interactive HTML teaching
  artifacts.
- **August 2026, "Advanced Context Engineering: Give your agent a brain,"**
  on building plugins that give agents a knowledge base persisting across
  sessions.

Earlier: a July 2025 lunch-and-learn on practical use of Cursor, an April
2026 demo to the company's AI guild, and a quarterly AI tech-talk cadence
agreed with leadership.

## Recurring demos and forums

- **Weekly developer-experience demo series:** a recurring presenter through
  summer 2026, demonstrating the security-fix skill, adversarial review,
  the subject-matter-expert plugin scaffold, the team marketplace, and the
  autonomous remediation harness and its learnings. One service's
  independent-deployment epic was generated live during a July demo. His
  framing at the last of them: any of the experiments can be adapted to
  many other use cases.
- **The organisation's AI-tools forum:** founded by Matt in February 2026
  as the cross-organisation channel for questions, access requests,
  troubleshooting, and knowledge sharing. It is where the marketplace alpha
  was announced and where the marketplace governance feedback landed.
- **A short-lived newsletter:** three monthly editions covering models,
  tools, and industry articles, retired in early 2026 in favour of sharing
  updates as they happen. Lower ceremony, higher frequency, more
  conversation.

## The skills library

Matt created and maintains the organisation's agent-skills library, the
distribution mechanism before the marketplaces. The skills for drafting
tickets and epics were the breakout hit; one engineer reported that they
turned three to four hours of work into a thirty-minute conversation, and
an early update to organisation leaders credited them with saving teams
significant time.

## Access, budget, and proposals

- Owns the organisation's AI tooling access and spend for agent workflows.
- Authored proposals to leadership: an AI-champions-per-team adoption
  proposal; the plugin marketplace governance proposal; an LLM
  evaluation-framework proposal (February 2026, local eval tooling first
  with managed evaluation later); and testing-workflow proof-of-concept
  notes written with peers elsewhere in the organisation.
- Invited onto organisation-wide agentic-engineering interview panels.

## Evaluating tools honestly

- Led a trial of a third-party coding agent in late 2025 that concluded
  **against** purchase. The trial ran as a structured internal programme
  with nine developers, trial questions, two weekly check-ins, and a
  survey.
- Led the Claude Code trial whose results informed the organisation-wide
  decision to adopt Claude Code and Cursor as primary tooling for roughly
  fifty engineers, and traded in his own seat on the other editor to pay
  for it.
- Enabled newer models in the company's existing AI account, coordinated
  network allowlisting, and pulled usage analytics for cross-organisation
  adoption measurement with three peers.

## On his own team

The Email Reliability team has 100 percent adoption of Claude Code for code
generation, with AI review on every pull request; every engineer on the
team has access, and Matt works alongside them using it daily. The
commit-trailer telemetry is a floor on that, not a contradiction: it counts
one tool's signature and the other editor leaves none.

## Where he wants to push next

Named openly as unfinished rather than claimed: making the remediation
agent a hosted pattern any team can run; broadening distribution and
publishing adoption evidence; exporting the proof-of-concept-to-production
playbook and the eval-then-upgrade discipline to at least one other team;
and taking the two context talks outside the company to a meetup and a
conference call for papers.
