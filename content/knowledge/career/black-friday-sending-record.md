---
id: black-friday-sending-record
title: Peak sending season track record, 2019 to 2025
summary: Matt's role in seven peak sending seasons, from the 2019 resilience library to owning readiness as player-coach and then as manager.
tags: [reliability, incident-response, email, peak-traffic, on-call]
updated: 2026-09-21
---

# Peak sending season track record, 2019 to 2025

Black Friday through Cyber Monday is the most important sending period of
the year for the platform's small-business users and a direct
differentiator against other marketing-automation products. The company had
struggled with stability in that window in earlier years. Matt's own
framing of why it matters: it is the most profitable time of year for many
users, successful sending performance during it is a competitive selling
point, and it helps reduce churn.

## Year by year

- **2019, as Software Engineer II:** built the resilience4j-based
  fault-tolerance library specifically to prepare for that season's sending
  volume, and raised then restored autoscaling floors across three services
  around the peak. The library remains the platform's pattern for handling
  downstream outages.
- **2021, as Software Engineer III:** early email-decomposition work on
  fault tolerance and event-driven flows continued building the foundation.
- **2022, first season as player-coach:** the first cycle under Matt's
  partial ownership, three months after taking the role. Ahead of it he
  hardened the engagement-tracking service: a same-day memory-limit fix
  after pods were being killed for exceeding memory, a two-layer cache in
  front of a datastore lookup on the click hot path, one tracking domain per
  message instead of per link, phishing-link blocking with an admin
  endpoint, and the autoscaler's CPU trigger lowered and replica floor
  raised after observing the service top out against a large queue
  backlog.
- **2023, player-coach with full ownership:** led preparation end to end.
  Opened the reliability tickets, coordinated twenty test tenants in the
  staging environment, ran load tests that came in "in line with
  expectations based on prior years' testing," and had scale-up complete by
  early November. Coordinated testing across ten services in the sending
  path, from the sending API and sync service to the risk-scoring, token,
  and template services.
- **2024, player-coach:** coordinated the deployment freeze with the
  reliability team, from late November to early December. Matt's framing at
  the time: weekend volume had been lower in recent years, but this
  remained the most important sending window for users, so the bar was that
  no critical incident could escape during it.
- **2025, as manager:** prepared the email-engagement limit enforcement well
  ahead of the season, specifically to restore inbox reputation with a
  major mailbox provider and leave enough time for transactional sending
  addresses to warm before the window. Cyber Monday 2025 peaked at 27.7
  million emails in a day.

Four consecutive seasons spanning player-coach to manager, with zero major
user-impacting incidents, on top of the 2019 resilience foundation.

## The ritual itself

The annual cycle is repeatable and Matt has owned and refined it across
four cycles: scale up by early November, freeze deploys for a window around
the peak, scale down in early December. The 2022 season added a lesson that
stuck: he caught the sending API's own peak-season scale-up values in
production after they had silently reverted to defaults, which is why
configuration drift is now something he checks rather than assumes.

## The February 2024 cloud-provider outage

When a major cloud-provider outage made the sending API unreachable for
about thirty minutes around midday, the queueing architecture the team had
built caught and retried every send, with zero dead-lettered messages.
Matt's words at the time: "the system was designed to queue up email sends
in the event of an outage, or email provider issues that we've seen in past
peak seasons. No actions on the part of users should be needed." And later:
"no email queue messages dead-lettered, meaning our team won't need to
manually retry any backend send attempts."

He was the team's point of contact, fielded the reliability team's
escalations, wrote the initial customer-facing status-page comms,
identified a duplicate-send side effect caused by layered retry logic,
checked the scope against the warehouse logs, and drove the post-outage
analysis across the reliability and product organisations.

## Adjacent peak-season protections

- **2023, free-trial and sandbox abuse.** Ahead of that season, and after a
  prior abuse incident, Matt worked with an operations partner and a senior
  leader to tighten sandbox and free-trial sending limits, tracking down
  the threshold code in the monolith and coordinating the fix.
- **2024 and 2025, capacity.** The recurring pod-count scale-ups and
  scale-downs for the sending and recipient-risk services, including a 2025
  scale-up sized after slower staging test sends.
- **2025, transactional routing.** A separate transactional send path for
  quotes, invoices, and receipts, so the eighteen-month marketing
  engagement policy could ship without blocking money-path mail.

## What is claimed and what is not

The engineering record shows what shipped and when. It does not, on its
own, prove that a given season would have failed without a given change,
and Matt does not claim that. What it does show is a documented state
before each intervention, a mechanism, and four consecutive clean seasons
afterward.

## Why this thread matters

Real-world validation that the architectural decisions paid off. The
resilience work held under both planned stress, the annual peak, and
unplanned stress, a provider outage.
