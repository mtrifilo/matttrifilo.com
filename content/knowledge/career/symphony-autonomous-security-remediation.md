---
id: symphony-autonomous-security-remediation
title: Autonomous security-ticket remediation with humans on the merge button
summary: How Matt dispatched coding agents unattended against the vulnerability backlog, with the governance posture and the honest numbers.
tags: [ai, agents, security, automation, claude-code, governance]
updated: 2026-09-21
---

# Autonomous security-ticket remediation with humans on the merge button

In August 2026 Matt adapted OpenAI's open-source Symphony orchestration
harness, via an internal fork developed by two colleagues, to dispatch
Claude Code agents unattended against Email Reliability's backlog of
dependency-vulnerability tickets.

## Timeline

The idea was floated on August 4, 2026. A research spike opened and the
first agent-authored pull request merged on August 10: a vulnerability fix
in the recipient-risk service with 128 tests passing, human-reviewed and
merged. A fix to the harness's silently broken token and turn accounting
followed the next day. Manual intake was retired on August 18, when a
daemon began polling continuously, and a dedicated channel was created as
the agent's reporting surface. A write-up was shared with the
organisation's engineering managers and the wider engineering channel on
August 31 so any team could adopt it.

## How it works, plainly

A daemon polls the issue tracker every sixty seconds for tickets carrying
**both** of two opt-in labels, the team label and a harness-specific label
applied only by the intake step, so nothing is dispatched by accident. It
clones the target repository from a curated allowlist keyed to the ticket's
repository field, then runs a Claude Code agent through the team's existing
unattended security-fix skill.

Concrete limits, from the configuration:

- up to **three concurrent agents**, each capped at **twenty turns**;
- a five-minute setup timeout per workspace;
- the agent works on a branch created for it, and is told not to create
  another;
- a stall or cancel parks any ticket still in an active state, so a killed
  run cannot loop forever, and a stall is explicitly not retried with
  backoff because the agent never reached an exit transition.

On every exit the agent must move the ticket **out of the active states**,
or the daemon would re-dispatch it indefinitely. Three exits are allowed:
pull request opened, which moves the ticket to a review state and posts the
surviving link to the ticket and the channel; duplicate or already-fixed,
the only case permitted to close a ticket, and only with evidence and a
request for human confirmation; and needs-a-human, which leaves the ticket
open with the reason written down. It opens one pull request per ticket,
folding duplicate advisories for the same package, and if an open pull
request already bumps that package past the safe floor it attaches to that
one rather than opening a second. **It never merges.** It also fills in the
planning fields, points and sprint, on every exit so the product board
stays complete.

## Results, August 10 to September 9, 2026

Fifty-seven dispatched runs; seventeen distinct pull requests across seven
repositories; roughly two million tokens; about 80 percent hands-free, with
the rest tapping out and asking for a human, as expected. A recount two
days later from the run log itself gives 59 runs with 47 clean completions,
five stalls, five non-active exits and two terminal, consistent with the
earlier count.

Duplicate and not-applicable advisories are closed with evidence rather
than forced. Deep cascades are handled the same way: one agent stopped
without a pull request when a fix required a three-minor-version bump of a
heavyweight dependency, after an extended investigation, and a later run
completed that bump with the full parse and compile verified across 43
models before opening the pull request.

**The caveat Matt attaches:** a pull request opened is not a pull request
merged. Merge status and human review time live in the code host, not in
the run log.

## Governance posture, in Matt's words

> "We still have full authority to click approve and disagree with agent
> outputs."

> "These are tools to help us, not gatekeepers."

> "Dark factories fall apart in these situations."

Transitive pins are never added without explicit approval, and the
harness's scope is deliberately narrow: dependency advisories on source
repositories only.

The wider frame, from the same threads:

> "I'm not a fan of fully autonomous agent flows that merge changes with
> zero human interactions, but we can certainly learn from the public
> successes of larger companies whose agent systems still have humans
> reviewing and signing off on the code."

> "Teams need some flexibility to set this up in ways that might be unique
> per team, versus prescribing things for the entire organisation that
> might not work for every team."

## What he did not oversell

Several teams asked detailed setup questions, requested API keys to run it,
or asked whether the skill could extend to other clouds, and one team
cloned the harness. As of September 10, 2026, **no other team was confirmed
running its own daemon**, and Matt said so publicly: a single registry for
the whole organisation "may entail too many edge cases to roll out in the
near term with any confidence."

## The scaling problem, named honestly

Matt's own research note on hosting states the limiter precisely: it is not
the number of repositories, because the registry already takes many. The
daemon fails as a platform because it is **operator-bound rather than
hosted**. Cloud hosting and covering every team repository are the same
problem: bot identity, an always-on host, and skills that travel with the
agent. He evaluated a competing editor's cloud agents as the
lowest-friction organisation-wide path and
concluded it is a thinner loop, not a drop-in replacement for the harness.
The research is done; the hosting decision is not, and his standing
instruction to himself is not to buy a cloud or file a hosting ticket
before that decision is made.

## Adjacent automation

An adversarial pull-request review, triggered by a mention, packaged as a
reusable GitHub Action so reviews do not burn individual token budgets, and
propagated to three of the team's services, and rolled onto a fourth by
the team. The target cost per review is low enough that running it on
every pull request is not a budget question, which is the point: it is the
mechanism for keeping review quality honest as agent-authored volume grows.
