---
id: owned-systems-and-operations
title: What the Email Reliability team runs, and how it runs it
summary: The systems Matt's team owns, the scale they run at, on-call, and how the team ships to production.
tags: [operations, on-call, sre, architecture, ownership, incident-response]
updated: 2026-09-15
---

# What the Email Reliability team runs, and how it runs it

## The one-paragraph version

Email Reliability owns the outbound email platform for the company's
marketing-automation product: the sending path from the core monolith
through the sending API to the mail transfer agents, the gateway fleet
itself, engagement tracking for opens and clicks, bounce and feedback-loop
intake, recipient- and content-risk scoring, domain authentication, the
email data warehouse and its transformation models, the compliance case
system, mailbox sync with Gmail and Microsoft, the AI email health
features, and the broadcast and domain-settings interfaces in the web
application. As of September 2026 the team is seven people on the code
host (contributors to the team's repositories, a wider set than the five
direct reports Matt's résumé lists), plus a product manager who partners
with the team and reports through product.

## Scale

| Figure | Value |
|---|---|
| Peak outbound volume | Up to about a billion messages a month at peak |
| Availability | 99.9 percent or better |
| Gateway objective | An uptime objective above the published platform figure, with send-latency targets |

## The send path, in one diagram's worth of words

The web application and its backend-for-frontend call the monolith's email
module, which is the entry point every product surface uses. It renders
merge fields, builds tracked links, writes to the legacy database queue, and
calls the sending API for tracking tokens. The sending API owns the send and initialise endpoints, a
publish-subscribe processing pipeline handling bounce classification, risk
scoring, tracking, return-path addressing and authentication headers, and
the hand-off to the mail transfer agent. From there the gateway routes to
recipient mail servers through the outbound address pools.

Around that core sit the engagement-tracking service (redirects and pixels,
publishing click and open events), the event bridge (a subscription bridge
back into the monolith with windowed aggregation and back-pressure
protection), the bounce service (classifying and publishing bounce events),
the recipient-risk service, the content-risk service and its spam-scoring
backend, the scheduling service (a durable, high-throughput alarm clock
built on task queues), and the compliance system.

## Ownership, and how they know what they own

The team maintains a written ownership inventory and records where its
sources disagree rather than leaving it implicit.

## The alert estate

Every production alert policy lives in code as a per-service module, and
everything routes to the team's paging rotation. That structure is the one
Matt built in 2024, extended rather than replaced twice since.

## On-call

A weekly rotation over roughly a dozen cloud projects, container and
serverless services, data pipelines, the gateway fleet, and third-party
feedback loops. Matt has been in the rotation since his individual-
contributor years, taking shifts and assisting other on-call engineers, and
he stayed in it as a manager.

The rotation's tooling is the on-call plugin: an alert-triage skill, a
shift-handoff skill, and a knowledge base of dated incident documents,
permanent runbooks, shift handoffs, and an alert routing table, under a
standing rule that every alert, including a one-off, gets a permanent
runbook. The knowledge base is written by the whole rotation, not by Matt
alone, which is the intended outcome.

## Signature production moments

- **February 2024, cloud-provider outage.** No messages were lost, thanks
  to the queueing architecture. Matt was the team's point of contact,
  fielded the escalations, wrote the initial status-page comms, checked the
  scope against warehouse logs, and coordinated the post-outage analysis.
- **Annual peak-season scale-up.** Scaled up ahead of peak season and back
  down after it, with a deploy freeze in between. Owned across four cycles
  and refined each time.
- **2023, sending-limit hardening.** Hardened sending limits ahead of peak
  season.
- **2025, contact-engagement hygiene.** Led a contact-engagement hygiene
  programme, coordinated with another team on the transactional path.
- **A short-lived delivery slowdown** that self-resolved; Matt wrote the
  follow-up proposal and used it to argue for accelerating planned platform
  work.
- **Routine defects and short-lived slowdowns** are caught by the rotation
  and fixed the same day.

## How the team ships

In 2026 the team moved its nine microservices (Java/Micronaut, Python, Go)
off the weekly release train onto independent, gated production deploys,
finishing in nine weeks, four months ahead of schedule. Any engineer can
ship to production once end-to-end, contract, load, and manual readiness
tests pass.

## Where the team charter is out of date

The charter's mission and its principles are durable. What has drifted: the
charter's uptime target is met and exceeded; its
code-review rule predates the automated review tooling the team now runs on
every pull request; and it does not mention the warehouse, the AI features,
the compliance migration, or independent deployment, all of which are now
major workstreams.
