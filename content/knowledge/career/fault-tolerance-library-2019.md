---
id: fault-tolerance-library-2019
title: The fault-tolerance library, 2019 to 2020
summary: How Matt turned two hand-built circuit breakers into a shared resilience library with its own failure-injection test harness.
tags: [resilience, resilience4j, circuit-breaker, java, platform, peak-traffic]
updated: 2026-09-21
---

# The fault-tolerance library, 2019 to 2020

The origin point of the resilience pattern the email platform has repeated
every peak season since, and the clearest early example of Matt noticing
that the same design had been built twice and turning it into one shared
tool.

## The problem

By mid-2019 the company's email-sending path made outbound calls to a
hosted email service and relied on a hand-rolled circuit breaker inside the
tracking-link service's client, with no shared, tested way to add retries,
circuit breakers, or time limits when those calls failed. The trigger
ticket named the risk plainly and timed it to the coming holiday season:
implement a circuit breaker with a retry and a time limiter for the legacy
sending strategy's outbound request.

Once that first implementation existed, the same problem appeared again in
the tracking-link service, whose ticket said its home-grown circuit-breaking
logic was "currently failing" and needed replacing so tracking data would
not be dropped.

By December the pattern had repeated enough times that the follow-up epic
framed the fix as extraction rather than a third copy: refactor the shared
library, on the basis of a senior engineer's review comments, to be more
ergonomic and stable, because the company mandates fault-tolerance patterns
as part of production readiness and its service-consumption guidelines, and
there was no internal tooling for implementing them.

## The numbers

**16 ticket-linked pull requests** between August 2019 and April 2020,
adding about 10,150 lines and removing about 580, across six repositories:
the monolith (8), the tracking-link service (4), the tracking-pixel service
(2), the shared library repository, a test harness, and a test client. Matt
was a Software Engineer II. The work sat under five epics, including a
"Q4 resilience work" epic whose description was, candidly, "items required
for future dev post deployment freeze."

## What he built, in order

**Adjacent email work that surfaced the failure modes.** Before the
resilience work proper, Matt was moving internal notification sending off
the monolith's sending service onto a notification API, and adding support
for per-recipient filters so digital-product merge fields could resolve as
Liquid merge fields. That is where the sending code's dependence on other
services' availability became visible day to day.

**First implementation, hand-built in the monolith.** He improved opt-in
and opt-out failure logging so the failure conditions were actually
visible, then built the first resilience utility for the hosted email
request, combining a time limiter, a retry, and a circuit breaker so
"failed requests have a chance at succeeding if the service failure is
transient, or stop calling the service briefly if it is down." The change
was dev- and product-pair-tested before merge. He then made those settings
runtime-tunable through the company's internal configuration service rather
than requiring a deployment to change them; the pull request states that
this "will be essential for responding to changing network conditions" at
peak. He wrote the architecture decision record formalising resilience4j as
the monolith's agreed resilience library.

**Infrastructure scale-up alongside the code.** In the same window he
raised autoscaling minimum and maximum idle instances for the hosted email,
tracking-link, and tracking-pixel services ahead of the peak, then restored
the pre-peak settings once traffic subsided. That scale-up and scale-down
discipline is the same ritual he owned across four later peak seasons.

**Second implementation, different service.** He replaced the
tracking-link service's failing hand-rolled circuit breaker with the same
approach, decorating every outbound request from that client. Doing the
same design twice, in two codebases, in the space of a few weeks is what
made the case for a library.

**Extraction.** Working from the senior engineer's review feedback, he
generalised the configurations into a standalone library. The pull request
lists the concrete first consumers it was built to serve: the event bridge's
dead-letter-queue resiliency, and normalising usage across the
tracking-link service, the hosted email service, and the monolith,
replacing both hand-rolled implementations with one shared, tested tool.

**Verification against real failure, not just unit tests.** Alongside the
library he built a **failure-injection test harness**, a service that can be
configured to fail on demand, and a client application that exercises the
library end to end against it. The retry, circuit-breaker, and time-limiter
behaviour could then be verified against a real, controllable failure
source rather than mocks.

**Rollout.** The following spring he replaced the tracking-link service's
interim utility-based implementation with the finished library, behind
feature toggles, and removed the now-redundant hand-rolled and interim code
paths in the same change.

## Options considered

| Option | Taken? | Why |
|---|---|---|
| A one-off fix in each service that needed it | Partly, then reversed | Done twice, recognised as duplication, extracted |
| Hard-code the thresholds in application code | No | Made runtime-tunable specifically for peak-season conditions |
| Verify the library with unit tests only | No | Built a dedicated failure-injection harness and client |
| Migrate all three planned consumers in one push | No | Only the tracking-link migration has a pull request in this window |
| Keep the existing hand-rolled circuit breaker | No | The ticket recorded it as actively failing |

## What happened after

The library's own epic resolved in February 2020 and the tracking-link
rollout in April. The sibling tickets to normalise the hosted email service
and the monolith onto the same library carry a resolution date of October
2021, roughly eighteen months later, so the full normalisation across all
three services took considerably longer than the initial push suggests.
Matt cannot describe the mechanism of those two later migrations from the
record.

## Caveats he keeps attached

- The claim that this work "mitigated many thousands of email sending
  failures during interruptions in microservice availability" comes from
  Matt's own career record, not from the engineering record. Verifying it
  would need production metrics or an incident retrospective from late 2019
  and 2020, which are not in evidence.
- A senior engineer's review comments shaped the library's design directly.
  This was not a solo design.
- Whether this library is still the company's standard resilience tool
  today is an open question.

## Why this matters

It is the first time Matt built a shared tool instead of a second solution,
and the first appearance of two habits that recur through his record:
runtime-tunable safety settings so operators can respond without a deploy,
and verification against a controllable real failure rather than a mock.
