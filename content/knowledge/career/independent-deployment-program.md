---
id: independent-deployment-program
title: Moving nine services off the weekly release train
summary: The 2026 program in which Matt led nine microservices onto independent, gated production deploys, four months ahead of target.
tags: [deployment, ci-cd, reliability, java, python, program-management]
updated: 2026-09-21
---

# Moving nine services off the weekly release train

The most concrete, quantifiable program of Matt's 2026. The team goal was
to get every Email Reliability microservice off the organisation's weekly
release train and onto independent, gated production deploys, with a
December 31 target. It finished on August 21.

## What "independent" required, per service

The organisation had an existing eight-criterion readiness standard,
written years earlier by another senior manager and used by all teams, with
its canonical requirements in the engineering handbook and a nine-step
migration track in a shared release-tooling repository. **Matt adopted that
standard rather than authoring it**, and it generated twelve to fifteen
tickets per service:

- an OpenAPI backward-compatibility gate in CI,
- contract tests,
- load-test baselines,
- microbenchmarks (JMH for the Java services, a benchmark plugin for
  Python, Go benchmarks for the Go service),
- service-level objective and indicator documentation,
- a production dependency audit, scoped to production on the mainline
  branch only,
- a unified release flow with CI approval gates,
- and a rollout plan.

What Matt built on top of the standard is a Claude Code skill that encodes
those requirements and patterns, so each service can be prepared the same
way without re-researching the process, and without spending the tokens to
do so. He also published the team's independent-deployment runbook in July
2026, and each service got an internal programme hub, a prerequisites
review, a rollout plan, compatibility notes, and a first-production rollout
plan.

## Sequence

The sending API piloted: readiness suite in late June, first independent
production deploy on July 9. Then the engagement-tracking service (July
28), the email sync and event-bridge services (both August 3), the
spam-scoring service (August 5), and the compliance, content-risk, and
recipient-risk services in the week of August 10. The scheduling service
completed the set on August 21, rebuilt to the standard in about two weeks.

Two services needed the pattern adapted rather than copied:

- the **compliance service**, a Python web-and-dashboard application, whose
  gates adapted the Java and Micronaut patterns to Python, and whose
  backward-compatibility criterion was approved without the standard
  OpenAPI diff because a checked-in specification plus three CI consistency
  checks was the honest equivalent for that stack;
- the **spam-scoring service**, a Go API with a daemon sidecar and no
  published SDK, which used Go benchmarks in place of JMH and waived the
  contract-test criterion.

Matt led the program and authored the readiness gates and first independent
deploys for all nine services. The team's product manager owned the
compliance service's epic, one engineer ran its discovery spike, and the
team's engineers reviewed throughout.

## Lessons the program wrote down as it went

The team's decision log turned recurring mistakes into rules the skill now
enforces, which is what let each service go faster than the last:

- keep environment configuration in plain manifests rather than a
  templating layer, after one service's release flow broke on it;
- preserve an existing CI tagging behaviour through the release-flow
  rewrite, because it was silently load-bearing;
- no shell heredocs in the CI configuration, learned the hard way in
  August;
- scaffold the documentation first and keep it stack-honest, so stacked
  pull requests do not make present-tense claims about gates that have not
  merged yet and trigger a review deadlock;
- do not put program sequencing documents in the service repository; the
  criterion docs belong there, the sequencing does not.

## Why it mattered beyond hygiene

Decoupling nine services from a shared weekly train means a small crew can
ship a security fix to one service without coordinating a release for all
of them. The sending API's security upgrade reached production on its own
schedule the week after it graduated.

The program also coincides with the team's median lead time to production
falling from 9.8 days in the second quarter of 2026 to 2.3 days in the
third. Matt is careful not to attribute that drop to deployment alone,
since the team's AI-agent adoption landed in the same window and the work
mix shifted toward many small tickets.

## What is honestly unfinished

Several services carry closeout items in the record: a backward-
compatibility CI gate still to be added against production for two
services, a release-visibility and scorecard row still to fill in for
others, and one service whose production specification returns an
authenticated response until its first independent promotion lands. The
program hit its first-production milestone for all nine; the last few
per-service closeout tickets trail it.

Matt rates this a lesser win than the AI and vendor work, calling it table
stakes, and it sits below them on his résumé for that reason.
