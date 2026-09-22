---
id: merge-api-decomposition
title: Merge API decomposition and the V2 sending path
summary: How Matt extracted Liquid template merging from the monolith into a standalone service, and the 2026 V2 sending work that grew from it.
tags: [decomposition, microservices, java, liquid, email, architecture]
updated: 2026-09-21
---

# Merge API decomposition and the V2 sending path

## The problem, 2020

The Liquid merging system is the code that takes a template, an email, a
letter, an SMS, and resolves fields like a contact's first name or a custom
field against real data. It lived inside the company's core monolith and
had accreted several inconsistent implementations across the products that
called it. Every merge-field bug fix and every new merge context, a new
object type you can pull fields from such as appointments or invoices,
required a monolith deploy, competing with everything else touching that
codebase. The merging logic itself carried legacy quirks around empty
fields, malformed template tags, and locale formatting that were hard to
reason about while buried in the monolith.

The first decomposition epic was filed by a senior leader in June 2020 and
was deliberately incremental: prove the pattern on one low-risk consumer
before expanding.

## The 2020 to 2021 extraction

The largest single body of work in Matt's 2017 to 2025 record. The ledger
counts **141 ticket-linked pull requests**, adding roughly 90,000 lines and
removing roughly 39,000, across seven repositories, over four sequential
phases, all closed Done between January and December 2021.

**Phase one (Aug to Dec 2020).** A Micronaut project skeleton, OpenAPI SDK
generation, and a security model borrowed from an existing service rather
than invented. All three environments stood up in parallel through Terraform
and Kubernetes. The domain model took shape as
**merge contexts**: contact first, then user, profile, and today. The
legacy Liquid utilities were ported behind a service interface
specifically so a more current implementation could be swapped in later.
The orchestrator landed next, followed by per-client exception handling,
Redis-backed security-token caching, and handling for malformed and legacy
template syntax. The client SDK published in October 2020.

**Phase two (Nov 2020 to Oct 2021).** The appointments context joined the
set, grown out of an earlier hackathon spike. Most of the locale-aware
custom-field formatting, currency, percent, date, yes-or-no, drill-down,
landed here, along with the first production-readiness checklist.

**Phase three (Mar to Jul 2021).** The high-volume asynchronous path:
merge-request batches landing in cloud storage, a subscriber retrieving
them, and an outbound flow, plus a new queue topic. A merge-fields
controller exposed the field list to user interfaces, replacing the
equivalent endpoint in the monolith. A production runbook and the first
integration-test collection with a documented definition of done were
added in the same phase.

**Phase four (May to Dec 2021).** The architecturally significant change:
support for consumer-supplied mergeables, which let a caller pass up data
it owns and define custom merge contexts on the fly. The ticket title was
"make the bring-your-own-mergeables hackathon work production ready", the
same hackathon-to-production pattern that runs through Matt's whole
record. That is what let the monolith itself become a consumer of the
service it had been decomposed out of, behind feature flags tested both on
and off.

The architecture that emerged: an orchestrator dispatches to per-domain
merge contexts (contact, user, profile, today, appointment, invoice, quote,
product) resolving into mergeables; consumers call synchronously through
the SDK or asynchronously through cloud storage plus a queue for bulk
volume; and a custom-mergeable escape hatch lets a consumer supply its own
context data without the service modelling it first.

The first consumer was the simpler automations product, then the web
application, and finally the core monolith. Matt led the effort for the
Platform Services team as a 2020 to 2021 tour of duty, partnering with a
senior engineer on the original design, and returned to Email Reliability
when it shipped.

## What it led to

- Matt's promotion from Software Engineer II to III in August 2020.
- The foundation of the multi-year email decomposition roadmap: migrating
  email status data out of the monolith, decomposing the status service,
  and integrating the merge service into the sending flow.
- Five years on, Matt remains the recognised subject-matter expert for
  Liquid merging at the company; engineers from other teams still route
  merge questions to him.
- The team also owns the legacy merge-fields library that runs alongside
  the extracted service while the decomposition continues. A leftover
  feature flag from a sibling decomposition was not fully retired until
  December 2024, three years after the phases closed, which is honest
  evidence that the decomposition had a long tail of consumer migration
  rather than a single cutover date.

## Options considered, and rejected

- A big-bang extraction of all merging logic and every consumer at once.
  Rejected: phase one was scoped to one low-risk consumer "for learning
  before moving onto other services."
- Reimplementing the Liquid templating engine from scratch. Deferred, not
  solved: the legacy library was wrapped behind an interface so it could be
  swapped later.
- Requiring every consumer's data shape to be modelled server-side as a
  first-class context before use. Superseded in phase four by
  consumer-supplied mergeables.
- A synchronous-only API. Rejected in phase three for volume the
  per-request path would never carry.

## The 2026 V2 proof of concept

Starting in June 2026, on a negotiated experiment-time allocation of about
30 percent, Matt built a local end-to-end V2 sending path: a rewritten
orchestration layer in the sending API, a scheduling service rebuilt on
Cloud Tasks with a rotating multi-queue to get past the per-queue rate
limit, and asynchronous bulk Liquid merging through the merge service. He
documented it with C4 models and a run of architecture decision records,
and packaged all research and artifacts as a plugin in the team's Claude
Code marketplace so anyone can resume the work with minimal context.

- **Throughput, measured locally in June 2026:** the orchestration layer
  handed all one million recipients of a broadcast to delivery in 13
  seconds, about 77,000 recipients per second on a single JVM. That is the
  basis for the claim of a roughly thousandfold improvement in the
  throughput ceiling over the legacy path.
- **The honest caveat Matt attaches to it:** the full end-to-end path,
  including the merge service and contact fetches from the monolith,
  measured about 123 merges per second against a target of one million per
  minute. The complete pipeline is unproven at the higher target;
  integration load tests are the next step.
- **Cost:** the analysis showed the new components would carry a small
  fraction of the legacy path's per-message infrastructure cost, most of
  which is attributable to the monolith. Specific figures are internal.
- **State as of September 2026:** the local proof of concept is closed and
  production traffic remains on the legacy path. The honest status line Matt
  uses is "proof of concept proven, production traffic still on the legacy
  path."

## Why this thread matters

This is the prototype of Matt's signature pattern: hackathon to proof of
concept to production service. Seven years later the same pattern produced
both the AI Email Engagement Summary and the V2 proof of concept, and the
V2 work is what made the email platform business case credible.
