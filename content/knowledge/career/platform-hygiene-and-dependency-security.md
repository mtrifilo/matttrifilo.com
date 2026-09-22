---
id: platform-hygiene-and-dependency-security
title: Platform hygiene across a microservice fleet, 2022 to 2025
summary: Four years of keeping roughly fifteen services current against framework upgrades, deprecations, CI end-of-life, and vulnerabilities.
tags: [maintenance, dependencies, kubernetes, ci, security, platform]
updated: 2026-09-21
---

# Platform hygiene across a microservice fleet, 2022 to 2025

## What this is

Not one project: four years of the same class of ticket landing on a fleet
on a rolling basis. A CI tool reaches end of life. A cluster upgrade
deprecates an API version. The internal dependency bill-of-materials ships
a security-bearing minor release. A scanner flags a vulnerability. A
checkout key ages past rotation policy. Owning roughly fifteen
microservices means someone keeps paying this tax or the fleet drifts into
unpatchable territory.

Two representative tickets, two years apart, show the shape: "upgrade your
microservice to the latest bill-of-materials, work the upgrades in
sequence," and a scanner entry naming a high-severity advisory in a
cryptography package with no fixed version available at the time.

These services sit in the outbound or compliance email path, so an
unpatched vulnerability or an unsupported API version is latent production
risk, not cosmetic debt.

## The numbers

**106 ticket-linked pull requests** between February 2022 and December 2025,
adding about 55,300 lines and removing about 37,600. A further 56 matched
by keyword or era without a ticket key bring the real total to 162, so the
headline understates the volume. Fourteen repositories, led by the
engagement-tracking service (20), the sending API (17), the recipient-risk
service (12), and the compliance and sync services (11 each). Ninety-seven
tickets: 69 tasks, 16 security tickets, 11 epics, one story. Per year: 13
in 2022, 15 in 2023, 31 in 2024, 47 in 2025.

The line counts are mostly generated SDK code and lockfile churn. They are
churn, not effort, and Matt says so.

## Five waves, not 106 decisions

**2022, deploy tooling (13 changes).** The same deploy-orb bump across
seven repositories in one week, plus the fix-ups it surfaced.

**2023, cluster API versions and the first framework wave (15 changes).**
Ahead of a Kubernetes minor upgrade, six repositories moved off deprecated
API versions; the first framework bill-of-materials push landed across five
services.

**2024, the framework wave continued, CI images, and secrets infrastructure
(31 changes).** The bill-of-materials wave carried on; a CI image
deprecation forced a second round; seven services adopted the cluster's
secrets-store driver; the first aged-secrets epic opened, and six checkout
keys were rotated by November.

**2025, the major framework upgrade and the vulnerability backlog (47
changes, the heaviest year).** A fourth wave took the fleet across a major
framework version boundary; sixteen scanner tickets closed across four
repositories; plus a regional migration and the Python runtime and package
manager upgrades.

Each wave has the same shape: understand what the change requires, apply it
service by service, verify build and deploy, merge, repeat. His stated
approach is to treat each wave as one decision applied many times rather
than letting it queue into a backlog.

## What happened after

There is no single "shipped" date; this is recurring maintenance. By
December 2025 the fleet was on the current framework version, the 2022-era
cluster and deploy-tooling debt was cleared, and the sixteen scanner
tickets in this set were resolved. The aged-secrets epic closed in May
2026. A regional-migration epic was still open past this window.

## Caveats

- The 106-pull-request headline counts only ticket-linked work; the true
  volume is higher.
- The record cannot show teammates' parallel work on the same repositories
  and tickets, or how the work was divided across the team.
- Nothing here shows whether this measurably reduced the open
  vulnerability count rather than just keeping pace with new alerts.
- "Done" in this document applies to child tickets; two parent epics
  resolve past the window.

## Why this matters

The 2026 work, nine services made independently deployable and an agent
harness fixing vulnerabilities unattended, is only possible on a fleet that
is already current. This is the four years of unglamorous upkeep that made
it current, and the reason the fleet never needed a disruptive catch-up
migration.
