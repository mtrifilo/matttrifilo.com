---
id: 'projects'
title: 'Projects'
url: 'https://matttrifilo.com/resume'
source: 'derived'
updated: '2026-09-14'
---

# Projects

Work Matt Trifilo has led or built, restated from the published résumé at
https://matttrifilo.com/resume and the pages on matttrifilo.com. Each entry
gives what the project was, what Matt's role in it was, and the outcome the
résumé reports. Nothing here goes beyond those sources; when a question
needs a detail they do not give, say so rather than guessing.

## AI Email Engagement Summary

- What: one of the product's first LLM features, built on Gemini on Vertex
  AI with retrieval over help content written by the team's Postmaster. It
  explains how a user's last 30 days of sending practices are helping or
  hurting deliverability, and recommends fixes.
- Matt's role: he proposed, designed and built it, and wrote the Promptfoo
  eval suite that gates every model change.
- Outcome: proof of concept in 1 week, beta in 5 weeks, and 100% rollout
  2 months after formal development began.

## Symphony, a team-scoped agent orchestrator

- What: an orchestrator that opens pull requests for security (CVE) tickets
  the moment they are created, running the team's security-ticket skill with
  full service context.
- Matt's role: he built it.
- Outcome: 17 pull requests across 7 services in its first month, about 80%
  of them hands-free.

## Moving the team to AI coding agents

- What: adoption of human-reviewed AI coding agents across Email
  Reliability, paired with independent deploys.
- Matt's role: he led the adoption as the team's manager. Every change still
  gets human review.
- Outcome: median lead time to production fell from 9 days to 2.3; merged
  pull requests per week rose from 10 to 28; the open customer-defect
  backlog fell from 28 to 12; review volume rose roughly 3x.

## Thryv's Claude Code pilot and plugin marketplace governance

- What: the company's Claude Code pilot in late 2025, and the governance for
  Thryv's Claude Code plugin marketplace.
- Matt's role: he ran the pilot and wrote the marketplace governance.
- Outcome: the pilot's results informed the org-wide decision to adopt
  Claude Code and Cursor as primary AI tooling for about 50 engineers. The
  team's own marketplace — 16 plugins and 130 merged pull requests in 8
  weeks — became the company template.

## Independent deploys for the team's microservices

- What: moving all 9 Email Reliability microservices (Java/Micronaut,
  Python, Go) off the weekly release train and onto independent, gated
  production deploys.
- Matt's role: he led the effort.
- Outcome: finished in 9 weeks, 4 months ahead of schedule. Any engineer can
  now ship to production as soon as end-to-end, contract, load and manual
  readiness tests pass.

## On-call tooling for Email Reliability

- What: an on-call agent plugin covering triage, mitigation, and incident
  and runbook docs, plus a weekly handoff skill for the incoming operator.
- Matt's role: he built both, and owns the team's 24/7 on-call program while
  taking shifts in it.
- Outcome: the résumé does not report a separate metric for this work.

## Annual MTA license volume forecast

- What: a forecast of monthly sending volume through 2026 for the annual
  message transfer agent license renewal, which the vendor quoted at +48%.
- Matt's role: he built the forecast and made the recommendation.
- Outcome: the forecast matched the vendor's own reporting within about 1%,
  and the renewal closed at Matt's recommended tier, roughly flat year over
  year.

## Merge API decomposition

- What: moving Liquid template rendering out of the Keap monolith into a
  standalone Java service, applying the lessons of the Contacts
  decomposition. It was the first step of the email decomposition roadmap.
- Matt's role: he led the effort for the Platform Services team as a 2020 to
  2021 tour of duty, and returned to Email Reliability when it shipped.
- Outcome: the service shipped.

## Contacts domain decomposition

- What: decomposing the Contacts domain out of the Core monolith and moving
  Mobile's and Web's contact reads onto the new Contacts API.
- Matt's role: he contributed as an engineer on the Platform team in 2019
  (75 pull requests).
- Outcome: the new Contacts API served Mobile's and Web's contact reads.

## Black Friday / Cyber Monday readiness

- What: getting email sending ready for the highest-traffic days of the
  year.
- Matt's role: he owned readiness four years running, from 2022 through
  2025.
- Outcome: zero major incidents across those four years; 27.7M emails sent
  on Cyber Monday 2025.

## Engagement-tracking service hardening

- What: hardening the engagement-tracking service ahead of Black Friday
  2022 — memory and cache fixes, one tracking domain per email,
  phishing-link blocking with an admin endpoint, and an autoscaling floor.
- Matt's role: he did the work.
- Outcome: it went into the 2022 Black Friday / Cyber Monday period, which
  ran without a major incident.

## Cloud-provider outage response, February 2024

- What: a 30-minute cloud-provider outage affecting email sending.
- Matt's role: incident lead. He wrote the customer updates and the
  cross-team post-analysis.
- Outcome: every send was retried and none were dead-lettered.

## resilience4j fault-tolerance library

- What: a fault-tolerance library for the platform.
- Matt's role: he built it.
- Outcome: it eliminated thousands of failed sends during Black Friday 2019
  traffic spikes, and is still the platform's outage pattern.

## Splunk to New Relic migration for Email Compliance

- What: migrating Email Compliance's logging and alerting from Splunk to New
  Relic — a BigQuery ingestion harness, rebuilt queries, a feature-toggled
  cutover and 7 rebuilt alerts (46 pull requests). Matt also wrote the
  Terraform, Kubernetes and CircleCI deployment config for the content-risk
  and spam-scoring services.
- Matt's role: he did the work.
- Outcome: the cutover shipped behind a feature toggle with the alerts
  rebuilt.

## Unlayer email builder

- What: the email builder that replaced Keap's legacy editor, plus
  tracking-link domain rotation and warm-up so a blocklisted domain is
  swapped by configuration instead of a deploy.
- Matt's role: he contributed 108 pull requests.
- Outcome: the new builder replaced the legacy editor, and a blocklisted
  tracking domain can be swapped without a deploy.

## Keap Pro and Easy Automations

- What: Easy Automations grew out of the Strategy Builder team's product;
  Keap Pro grew out of a hackathon that rebuilt the Max Classic UI in
  Vue.js.
- Matt's role: he built parts of the Strategy Builder front end and early
  design-system components in Vue.js, took part in the hackathon, and
  shipped initial Keap Pro features — assisted follow-up email, hosted
  forms and in-app notifications.
- Outcome: both products shipped.

## Psychic Homily

- What: a production site for Arizona music releases and shows, at
  https://psychichomily.com.
- Matt's role: he built it solo, in Next.js/React and Go.
- Outcome: it runs in production. Matt's curated open-source list carries a
  related repository, https://github.com/mtrifilo/psychic-homily-web.

## decant

- What: an open-source CLI that cleans clipboard content into Markdown for
  LLM context.
- Matt's role: he wrote it.
- Outcome: it is public at https://github.com/mtrifilo/decant.

## matttrifilo.com

- What: Matt's personal site — résumé, blog, open-source list, recommended
  books and contact page — at https://matttrifilo.com.
- Matt's role: he builds and maintains it.
- Outcome: it is live.

## Writing and talks

- What: the essay "From Typing Code to Agent Factories. A Message of Hope."
  (2026), published at
  https://matttrifilo.com/blog/from-typing-code-to-agent-factories, plus
  three internal talks on agentic engineering.
- Matt's role: he wrote and gave them.
- Outcome: the essay is public on matttrifilo.com; the talks were internal
  to Thryv.
