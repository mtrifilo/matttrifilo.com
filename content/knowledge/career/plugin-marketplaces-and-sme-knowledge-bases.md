---
id: plugin-marketplaces-and-sme-knowledge-bases
title: Claude Code plugin marketplaces, governance, and per-service knowledge bases
summary: How Matt turned an ad hoc skills library into governed plugin distribution, then gave every service a knowledge base agents load.
tags: [claude-code, plugins, governance, architecture, knowledge-base, developer-experience]
updated: 2026-09-15
---

# Claude Code plugin marketplaces, governance, and per-service knowledge bases

Turning the agent-skills library into governed, versioned distribution
infrastructure, then using it to give every service a persistent "second
brain" that agents load on demand.

## Origins and attribution, stated precisely

A colleague scaffolded the organisation-wide Claude Code plugin marketplace
repository in May 2026. Matt authored the marketplace governance proposal
(June 2026) and the architecture decisions that made it federated and safe:

- **skill content stays in the domain repositories** and is federated into
  the marketplace by subdirectory sync, rather than duplicated;
- **symlinks were rejected** because the install cache copies plugin
  directories;
- **semantic-version tags plus an allowlist of known marketplaces** for
  stable rollout;
- **CI validation on every pull request**;
- **an audience test**: a catalog entry must serve engineers outside its
  source repository. This came from review feedback that the marketplace
  should stay curated rather than accumulate whatever anyone wanted to add.
  Matt adopted the generic, product-specific, repo-specific taxonomy and
  added the producer-versus-consumer refinement, then removed two entries
  that failed the new test.
- **never mark a federated entry non-strict**, and **a destination-aware
  scaffold** so the same command works for a team marketplace or the org
  one.

Matt also discovered and documented that the plugin validator passes a
broken federated manifest, and recorded it as a decision for others to work
around. When a peer reported that the second editor was silently skipping
plugins, he reproduced it on his own machine, traced it to that editor
skipping symlinked folders under its local plugin directory, found the
upstream issue, and fixed the documentation to copy rather than symlink.

## The three-tier model

| Tier | Where content lives | Status at version one |
|---|---|---|
| Organisation-wide shared plugins | Marketplace's own folders | Shipped |
| Federated shared-repo skills | Upstream domain repositories, synced by subdirectory | Shipped |
| Per-service subject-matter plugins | The service repository's own plugin bundle | Scaffold command shipped; first pilot shipped July |
| Team multi-repo plugins | Marketplace team folders | Deliberately deferred |

## What shipped

**Version one, July 2026:** federated skills from two product teams; shared
plugins for common practice, security, Java, Micronaut, infrastructure, and
API design; an adapter
for a second editor with the same content in a separate catalog, copied
rather than symlinked; and the subject-matter-expert scaffold command.

**The subject-matter plugin system**, in three tiers: a thin agents file as
the baseline in every repository, a plugin bundle owned by the service
team, and a thin marketplace catalog pointer. One skill scaffolds it; a
second, from August 2026, promotes lessons learned in tickets, the
landmines, into the knowledge base so it compounds. The pilot was the
service everyone least liked touching, chosen for exactly that reason. This
is the content of the August 2026 talk on giving agents a brain.

**The team marketplace, July 2026:** Email Reliability's own marketplace,
built in a day as a sibling to the organisation pattern rather than a fork
of it, with dual catalogs for both editors, CI validation of every plugin
on every pull request, and a shared adversarial-review workflow other team
repositories call. The plugins are grouped by kind:

- **operations:** the on-call plugin, two skills plus the runbook and
  incident knowledge base;
- **project second brains:** the decomposition research, the compliance
  migration, independent deployment, and several platform projects, each
  carrying that project's decision records, research spikes, rollout
  plans, and handoffs so anyone can pick the work up cold;
- **automation, ticket in and pull request out:** domain-record insertion
  and routine record-maintenance workflows;
- **engineering quality:** a parallel multi-aspect review suite and a
  pull-request-native adversarial reviewer (an engineer's contribution,
  extended), plus a hook that blocks ambiguous push commands;
- **federated service context:** three per-service subject-matter plugins
  whose content lives in the owning service repository;
- **personal tooling any engineer can use:** a plugin that helps an
  engineer compile their own work record, with outputs staying local.

**Scale and contribution:** most of the commits and merged pull requests on
the team marketplace are Matt's, with contributions from several other
engineers and one automated author.

## The on-call plugin, in detail

**The problem.** The team runs a weekly on-call rotation over roughly a
dozen cloud projects, container and serverless services, data pipelines, a
mail gateway fleet, and third-party feedback loops. Alerts arrive from
cloud monitoring and the service-management tool. Before the plugin the
runbooks were partial and the rest was tribal knowledge.

**What it does.** Two skills, no agents, no hooks; everything is skill plus
knowledge base.

- The **alert-triage skill** runs five steps: capture the alert's identity,
  severity, project, time, and log query; route it through the routing
  table, checking recent firings before declaring anything a first firing;
  if nothing matches, triage from first principles by inspecting the alert
  definition itself, checking service health, pulling logs, and confirming
  whether the underlying work actually succeeded rather than trusting the
  alert, the "phantom error" check; decide remediation against the
  runbook's mitigation table; and close the loop by writing a dated
  incident document and, always, a permanent runbook, then updating the
  routing and past-incident tables.
- The **handoff skill** writes the end-of-shift handoff and publishes it to
  the wiki. A cadence rule forces a carry-forward when one alert keeps
  firing, so sustained problems get raised rather than re-triaged weekly.

**The knowledge base is the product:** a routing index mapping alert names
to runbooks and listing every past incident with its root cause; a toolbelt
of projects, query recipes, cluster patterns, and a "heuristics learned in
triage" section; and two templates. Its provenance file records that it
began as Matt's personal shift notes and became the authoritative
in-repository copy on July 22, 2026.

**Scale:** a knowledge base of dated incident documents, permanent
runbooks, shift handoffs, and an alert routing table. Of the incident
documents whose authorship the version history can attribute, **most were
first committed by teammates rather than by Matt**, which is the intended
shape: he wrote the seed, the team writes the growth.

**How it was built:** three months of writing a runbook for every alert he
saw on his own shifts, under a standing rule that even a one-off alert gets
a permanent runbook; then governance first, demoing the marketplace
proposal to the developer-experience leads the week before; then the team
marketplace in a day; then handing the keys over on day two, when an
engineer's pull request made the whole team contributors. When a root cause
was corrected after the fact, the correction went into the runbook, not
just the incident document.

## Adoption signals

- Engineers beyond Matt have opened pull requests on the organisation
  marketplace.
- An engineer on another team requested write access after a demo.
- A manager from another organisation routed engineers to Matt for the
  on-call plugin; two more engineers asked for the link the same week.
- Teammates run it without him: one ran the handoff skill end to end and
  published the result; another triaged an alert storm and added
  a new runbook for recognising that shape of storm.
- Another engineer turned the pattern into a template so other teams
  bootstrap the same way; Matt announced the template organisation-wide in
  August 2026.

## Not yet measured

Install counts, mean time to triage before and after, and whether any other
team is running an adapted copy in its own rotation. Matt names all three
as open items rather than implying them.

## Why this matters

This is the first of Matt's workstreams where the governance, the alignment
with other teams' technical leads, and the per-team rollout path were built
before the broadcast, rather than after.
