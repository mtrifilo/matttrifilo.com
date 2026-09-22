---
id: email-lower-environments-and-ci
title: Building the email services' lower environments and CI, 2019 to 2020
summary: Five email services had no real lower environments. Matt built them, service by service, with the CI later work assumes.
tags: [infrastructure, terraform, kubernetes, ci, environments, platform]
updated: 2026-09-21
---

# Building the email services' lower environments and CI, 2019 to 2020

## The problem

When Matt moved onto email in late 2019, five services (the content-risk
and spam-scoring services, the email compliance system, and the tracking
link and tracking pixel services) had no real sandbox, integration, or
staging environments. Everything ran in production, or in ad hoc setups
that did not match it. The umbrella epic states the goal in one line: align
with the wider engineering organisation to get sandbox, integration,
staging, and production environments set up for all of these projects. The
company-wide multi-environment initiative behind it framed the stakes more
broadly: product quality was not where the company wanted it to be.

The content-risk service is what made this urgent. It scores the words and
sending behaviour of an account to detect which tenants are damaging, or
improving, the platform's email deliverability. Its second version was
being called from the monolith in **shadow mode**, with its answer thrown
away, and the epic asked for that to change: integrate what it returns as a
replacement for the old scoring, probably behind a feature flag.

## The numbers

**65 ticket-linked pull requests** between December 2019 and June 2020,
adding about 5,150 lines and removing about 1,200, across ten repositories:
the content-risk service (14), the spam-scoring service (11), the cloud
resources repository (9), the tracking link and pixel services (8 each), the
compliance service (6), the infrastructure repository (6), and single
changes in the monolith, DNS, and the bounce service. Matt was a Software
Engineer II.

## What he built

**Framework upgrades and environment scaffolding.** The starting point for
most of these services was the company's internal Kubernetes and cloud
application framework. Matt upgraded the tracking link and pixel services
to the current framework version and stood up their integration
environment, following the framework's own migration guide, did the
equivalent for the smart-lists service, and replaced a deprecated
cloud-validation extension with a newer shared library across both tracking
services.

**The compliance service's cron migration.** He converted the service's
scheduled jobs from a managed application-hosting platform to Kubernetes
cron jobs, basing the new infrastructure directory on an existing service's
pattern, added the header the new cron endpoints required, and wrote the
infrastructure-as-code for its integration and staging projects plus the
Kubernetes deployment manifests.

**The content-risk and spam-scoring services, the largest and most
methodical piece.** Both needed full integration, staging, and production
builds on the shared cluster, and Matt built each environment's namespace,
service accounts, manifests, and CI workflow largely from scratch, one tier
at a time. Several of these changes record real debugging rather than
configuration authoring:

- a load-balancer 502 traced, with a colleague, to two missing Kubernetes
  ingress properties;
- a production CI pipeline that needed three follow-up fixes, a missing
  build step, a persisted-workspace fix for the publish job, and
  copy-pasted staging references left in the production config, before it
  worked end to end.

**CI hygiene applied across the fleet, not service by service.** Corrected
regular-expression filters so the release-tag workflows actually matched
their tag patterns; a spelling error in a staging-migration job reference
that had been silently broken; and the removal of an unneeded artifact job
from the release workflow across three services in one afternoon, then its
reinstatement months later once it turned out to be required for SDK
release builds, at another engineer's request. That last reversal is in the
record as a reversal, not smoothed over.

**Closing the loop.** Once both services had real environments, Matt moved
their inter-service calls onto cluster-internal addressing. Then he
implemented the content-risk SDK in the
monolith and refactored the existing shadow request to run on a separate
thread asynchronously, the same pattern he had used on the Contacts API
comparison, so the monolith could actually consume the new service instead
of discarding its answer. A CI modernisation across nine services landed in
the same window.

## Options considered

| Option | Taken? | Why |
|---|---|---|
| Leave the content-risk service in permanent shadow mode | No | The epic's stated goal was to replace the old scoring once trust was established |
| Keep internet-facing URLs between in-cluster services | No | Switched to cluster-internal addressing |
| Run the shadow call synchronously on the request thread | No | Refactored to run asynchronously, consistent with the Contacts API design |
| Patch each service's shared CI bug independently | No | Applied uniformly in one batch |

## What happened after

Seven tickets covering both services' three environments and the monolith's
consumption of them resolved inside a tight two-week window in March 2020,
which confirms the environment builds and the integration landed together
as intended. The parent story about actually replacing the old scoring in
the monolith resolved a month later, consistent with a shadow-mode
verification period before the switch, though the cutover change itself is
not in the record.

## Caveats

- This is infrastructure and enablement work, not a customer-facing
  feature. There is no direct customer metric attached to it.
- Several fixes were collaborative debugging: a colleague found the missing
  ingress properties, and a container-registry permission fix came out of a
  conversation with a teammate.
- The umbrella epic carries a resolution date years later that is almost
  certainly a data artifact rather than a real timeline fact.

## Why this thread matters

This is why the email services have lower environments at all. Later work,
from the fault-tolerance rollout and the second content-risk version to
every independent-deployment gate in 2026, assumes this foundation.
