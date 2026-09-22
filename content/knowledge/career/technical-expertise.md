---
id: technical-expertise
title: Technical expertise, stack by stack
summary: The languages, frameworks, cloud services, AI tooling, operational scale, and security surface Matt works in, and how each was used.
tags: [java, typescript, python, gcp, ai-tooling, security]
updated: 2026-09-21
---

# Technical expertise, stack by stack

## Languages

- **Java.** Primary back-end language for many years: the company's
  monolith, then the microservices extracted from it, on Spring Boot and
  Micronaut. Every service he took off the shared release train in 2026 is
  Java except two.
- **TypeScript and Node.** His preferred stack for rapid AI prototyping and
  agent-harness work; the autonomous remediation harness is TypeScript on
  an agent SDK. Prefers a lighter web framework over the default one where
  performance matters.
- **Vue.** His original front-end discipline, and one of the first Vue
  projects at the company. He has written Vue in every role from Software
  Engineer I to the present, as needed.
- **Python.** Across the team's Python services: a web-and-dashboard
  compliance application, a data service, and cloud functions. He led the
  runtime migrations across three minor versions and the move to a modern
  package manager for the team.
- **Go.** Personal projects, plus vulnerability-driven runtime upgrades in
  the spam-scoring service.

## Frameworks, patterns, and tools

- Spring Boot and Micronaut for Java back ends; a shared bill-of-materials
  for fleet-wide dependency management, which he has upgraded across the
  fleet four times.
- Kubernetes, serverless containers, and task queues, including the
  rotating multi-queue design that gets the scheduling service past the
  per-queue rate limit.
- Google Cloud Platform: publish-subscribe messaging, BigQuery, Datastore,
  Vertex AI, Vector Search, secure token services, regional migrations, and
  project lifecycle and deletion-protection management.
- GitHub and GitHub Actions, including reusable workflows, workload
  identity federation, and the Claude Code action; CircleCI.
- The Atlassian suite and its command-line interface.
- OpenAPI with backward-compatibility gates; K6 load testing; JMH and
  Python and Go microbenchmarks; Promptfoo evaluations.
- resilience4j for fault tolerance; event-driven architectures,
  publish-subscribe, dead-letter queues, and retry strategies.
- Terraform; DNS infrastructure; Salesforce object models, query language,
  and OAuth client-credentials authentication.
- Email infrastructure: mail transfer agent operation and migration, DKIM,
  SPF and return-path handling, sending-address warm-up, bounce
  classification, suppression lists, and direct deliverability negotiation
  context with the major mailbox providers.

## AI and agentic tooling

- **Daily drivers:** Claude Code as the primary harness, with a
  planning-and-writing model for planning and business writing and a
  faster model for unattended agents; plus a second editor.
- **Agent infrastructure he built, adapted, or runs:** two Claude Code plugin
  marketplaces (one organisation-wide and co-maintained, one team-owned and
  solo), the subject-matter plugin system with its scaffold and capture
  skills, the unattended security-remediation daemon (OpenAI's open-source
  Symphony harness, adapted through an internal fork two colleagues built),
  an adversarial
  pull-request review action, the security-fix skill, the
  independent-deployment skill, ticket- and epic-drafting skills, a
  pull-request-opening skill, a weekly-wins skill, and roughly forty
  personal skills.
- **Models evaluated in production**, each upgrade eval-gated rather than
  assumed: three successive Gemini Flash releases on the email health
  service, and Claude and competing models for agent work and redundancy
  planning.
- **Tool-integration servers used:** a messaging one, an issue-tracker one,
  and a browser-devtools one. He prefers command-line tools for coding
  tasks because they cost less context.

## Operational and production expertise

- Systems sending up to about a billion emails a month at 99.9 percent
  uptime, with a trailing-twelve-month volume around 5.3 billion in 2026
  and 99.97 percent volume-weighted availability measured across the
  runtime services.
- Four consecutive successful peak sending seasons as lead.
- A mid-year cloud-provider outage handled with zero dead-lettered
  messages.
- Email authentication and deliverability work, including sender-identity
  enforcement, default authenticated sending addresses, return-path logic,
  reputation restoration with a major mailbox provider, and bounce-storm
  mitigation.
- Nine microservices made independently deployable with contract, load, and
  benchmark gates.
- Regional migrations, secret rotations, service audits, and a
  workload-identity credential migration.
- Legacy service sunsetting across at least six separate systems.

## Security and compliance

- Works within payment-card, privacy, and security audit requirements as
  they come up for the team.
- Delivers security tickets within target; 323 security and
  dependency-scanner tickets resolved in 2026 through September 10.
- Stood up autonomous vulnerability remediation with human merge gates, on
  OpenAI's open-source Symphony harness adapted through an internal fork two
  colleagues built.
- Ran a two-organisation supply-chain audit across 528 repositories in
  response to an active registry worm.
- Built phishing detection and blocking capability, including
  immediate-effect domain blocks. The detection mechanics stay internal.
- Understands service-token authentication, JWT patterns across several
  identity providers, signed cloud tokens, Salesforce OAuth
  client-credentials, and their edge cases, including a permission error
  that traced back to a token-provider mismatch rather than to
  permissions at all.

## Data and warehouse

- A 43-model transformation project with 179 tests on scheduled cadences,
  landing fifteen raw event tables from five cloud projects.
- Scheduled-query pipelines feeding compliance scoring and two production
  suppression tables.
- An in-flight migration of the warehouse to a different platform, with
  downstream consumers across several teams served through authorised
  views and staging tables with freshness commitments.

## Financial and vendor work

- A mail-gateway vendor renewal analysis: a warehouse-validated volume
  forecast that matched the vendor's own numbers to within about one
  percent, a recommended monthly volume tier derived from modelled volume
  scenarios, and a closed contract at that tier with no service disruption
  during the negotiation.
- Cost-per-thousand-emails modelling for the legacy path against the new
  one.
- Fleet right-sizing on the sending gateway, halving the machine count.
- API-spend accounting for agent runs, and business-case packaging with
  cost to build, cost to maintain, and estimated return.

## The current-role numbers

Hands-on coding, daily. In 2026 through September 10, while managing the
team: 545 merged pull requests and 1,611 commits across 23 repositories,
663 tracker issues resolved, 563 issues authored for the team, 26 epics
owned, and 165 teammate pull requests reviewed since May 1 across roughly
twenty repositories for ten distinct authors.
