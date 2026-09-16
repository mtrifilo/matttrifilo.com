---
id: post-acquisition-integration
title: Post-acquisition integration and the compliance case-system migration
summary: The unglamorous integration work the acquisition required: moving compliance case handling to a new Salesforce and hardening the system.
tags: [integration, salesforce, compliance, gcp, operations]
updated: 2026-09-15
---

# Post-acquisition integration and the compliance case-system migration

The unglamorous integration work that the acquisition required, owned end
to end.

## Moving compliance case handling to the parent company's Salesforce (May to August 2026)

The email compliance team handles compliance cases through an internal
compliance system whose case records lived in the acquired company's
Salesforce organisation. The system evaluates tenants against compliance
policy, opens cases for review, and drives the resulting notifications and
restrictions. Moving its case handling to the parent company's Salesforce
meant rewriting how it authenticates, how it addresses tenants, and what
fields it writes, without stopping enforcement.

**What Matt did:**

- Created the epics for the cutover, the gap implementation, and the
  research spikes.
- Built a **per-target configuration toggle** so the system can write to
  either organisation, and neutralised the hard-coded record identifiers
  and queries that assumed the old one.
- Implemented OAuth client-credentials authentication ahead of a vendor
  authentication deadline, so the system could read and write cases in the
  new organisation by early June.
- Authored the field-parity analysis, plus findings documents on the
  cancel-grace-period and email-score behaviours.
- Introduced a **gap-annotation convention** so every shortcut in the code
  is traceable to a tracked gap, after one of his engineers pressed for a
  gap-tracking convention. That convention is why the remaining parity work
  was legible to someone else when he handed it over.

**The hard parts.** The two organisations model tenants differently, which
was resolved by keying on a dedicated identifier field with the parent
company's administrators. Sandbox identifiers changed between the spring
discovery and the August implementation, almost certainly a sandbox
refresh, so every record type and owner identifier had to be rediscovered
rather than reused; Matt recorded that the earlier values were stale rather
than letting the next person trip on them.

**The slip, stated plainly.** The planned two-week cutover window did not
hold. Both epics closed in early August; one engineer carried the remaining
parity gaps to production through late August, when paid cases first
appeared in the new organisation, and made the target switch **fail loudly
with a paging alert** rather than fall back silently. Tickets were still
open under the three epics when the implementation epics closed, which is
why Matt names writing down a "done" definition as an open item: the epics
closed while production paths were still landing.

## Case-system reliability hardening

He also hardened the case system's operational readiness after a
production failure.

He then strengthened the case system's post-deploy verification and its
resilience under autoscaling.

This sits on top of five years of earlier ownership of the same system: the
vendor-exit data-plane rebuild in 2020, a warehouse-source migration in
2023 alongside a defect fix and the removal of dead dashboard tabs, and a
2025 upgrade regression that he root-caused, fixed, and covered with unit
tests. He opened the modernisation epic that fix now sits
under and assigned it to the product manager rather than to himself.

## Smaller items

- Moved the email data service and related serverless services to a new
  region in May 2026, diagnosing a scheduler-timeout bug along the way.
- Delivered the email side of the company-wide phone-number formatting
  initiative in June 2026, unblocking another team.

## Why this thread matters

Integration work is where a leadership claim either holds or does not. The
mechanisms here, a target toggle instead of a fork, a parity analysis
instead of a guess, a gap convention instead of silent shortcuts, and an
alert that fails loudly instead of falling back quietly, are what let the
migration be handed to someone else mid-flight and still land.
