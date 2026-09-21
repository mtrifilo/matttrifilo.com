---
id: new-relic-to-cloud-operations
title: Migrating alerting and dashboards to Google Cloud Operations, 2024
summary: Under a vendor shutdown deadline, Matt rebuilt production alerting for nine services as a repeatable module the team still pages off.
tags: [observability, alerting, terraform, gcp, on-call, sre]
updated: 2026-09-21
---

# Migrating alerting and dashboards to Google Cloud Operations, 2024

## The problem

The company set a hard deadline: New Relic was going away company-wide on
March 1, 2024. Email Reliability ran its custom operational dashboards and
every on-call-connected alert policy in New Relic, across nine services and
the monolith's email domain. The epic, filed by the team's product manager
at the end of January, gave about a month: recreate the custom dashboards
in the cloud provider's monitoring stack, migrate any alerts the reliability
team was not bringing over, and migrate parity of the compliance
dashboards.

The stakes were operational, not cosmetic. These alerts are what page
on-call when the sending pipeline breaks, and a gap during the cutover
meant flying blind on a system sending up to a billion emails a month.

## The numbers

**39 ticket-linked pull requests** between February and September 2024,
adding about 2,750 lines and removing about 350, across ten repositories:
the alerts repository (18), the infrastructure repository (7), and one to
three each in the Java and Python services. Two epics, roughly 2,300 lines
of new alert configuration. Matt was a Software Engineer III and
player-coach.

## What he built

**Dashboards first, against the deadline.** Matt owned all four dashboard
migrations, closing three by March 1 and the fourth by March 20. The
dashboards were rebuilt directly in the cloud monitoring console rather
than through infrastructure-as-code, so what appears in the record is the
runbook and README updates pointing the team at the new locations, not
panel-for-panel fidelity.

**Then the alert rebuild, service by service.** He designed the migration
around a specific structure, written into the ticket before any code: a
**separate alert dashboard whose panels are clones of the monitoring
dashboard's panels, decoupled** so each alert panel can carry its own
paging notification channel without being tied to the monitoring view. He
implemented that as a standard infrastructure module per service, one file
per environment, across the sending API, engagement tracking, email sync,
event bridge, content risk, recipient risk, spam scoring, email compliance,
and the scheduling service, plus two batches of log-based alerts for the
monolith's email domain.

**Standardised health checks so the alert config needed no one-off hacks.**
Several services returned inconsistent health-check payloads. Matt changed
two of them to return a uniform status body "to allow the health check
alerts to work without one-off configuration changes that are difficult to
test," then added the corresponding health-check alerts.

**Thresholds tuned against real ambient noise, not one global rule.** Rather
than one global error-rate rule, each alert was tuned against its own
service's ambient error rate, with the reasoning recorded in the ticket: an
alert "should only activate on-call operators when the error rate spikes
high enough to indicate a potential service issue." He also flipped
lower-environment alert severities from critical to warning so on-call was
not paged for non-production noise, added priority prefixes so the paging
tool mapped severity correctly, and required corroborating signal before a
health-check alert pages, to cut false alarms.

**One approach tried and reverted.** For the recipient-risk service he
first tried Kubernetes auto-instrumentation annotations for OpenTelemetry,
following the reliability team's documented pattern. It did not produce
usable metrics, and he reverted it the same week, noting a custom metrics
endpoint as the next step.

**Agent and secret removal.** Once alerting was live he upgraded the base
image on five services to drop the vendor agent from the runtime and
deleted its constants and usages from the sending API. Under a later
reliability-team-driven epic he removed the leftover secret references for
two services; a colleague handled the equivalent work for three others,
which Matt does not claim.

## Options considered

| Option | Taken? | Why |
|---|---|---|
| Keep alert panels coupled to the monitoring dashboard | No | A decoupled alert dashboard so each alert carries its own notification channel |
| Auto-instrumentation annotations for one service | Tried, reverted | Did not produce usable metrics |
| One global error-rate threshold across services | No | Per-service thresholds tuned against each service's real ambient error rate |
| The same severity in all environments | No | Lower environments set to warning so on-call is not paged for non-production |
| Leave inconsistent health-check payloads per service | No | Standardised so the alert configuration needed no per-service special cases |

## What happened after

The alert rebuild held. The production alert inventory two years later
still shows the per-service pattern this project established. Two years of
growth layered on top without replacing the foundation: a wave of gateway
policies for the team's new mail-transfer platform, and the data-pipeline
alerts, all following the same per-service pattern.

That alert estate is also what the team's 2026 on-call plugin routes
against. The plugin's triage skill routes an incoming alert through a
routing table indexed against exactly this kind of per-service policy, and
its fallback tells the on-call engineer to inspect the alert definition in
the alerts repository. The definitions authored here in 2024 are the ground
truth an agent-assisted on-call rotation still triages against in 2026.

The secret cleanup ran long after alerting was live; its epic was not
resolved until August 2025, because it depended on each service team
removing its own references first.

## Caveats

- One epic still shows as open though every child task is done. Check
  before citing it as fully closed.
- The dashboard rebuilds happened in a console, not a repository, so the
  record shows runbook pointers rather than fidelity evidence.
- The epic called out compliance-dashboard parity, but the compliance-side
  work in the record is all alert-related. There is no direct evidence a
  dedicated compliance dashboard migration happened under this project.
- No alert-noise or mean-time-to-resolve metrics exist before and after the
  threshold tuning, and no cost saving from the terminated contract is
  recorded.
- No coverage-gap incident appears in the record, and Matt does not claim
  one was avoided.

## Why this thread matters

The observability estate the team pages off was built here. "I wrote the
on-call plugin" is incomplete without this.
