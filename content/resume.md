# Matt Trifilo

**Hands-on Engineering Manager · Email infrastructure at scale · AI-agent enablement**
Phoenix, AZ · Open to relocation (Chicago preferred) · In-office, hybrid, or remote (US)
matt.trifilo@gmail.com · linkedin.com/in/matttrifilo · github.com/mtrifilo · matttrifilo.com

Engineering manager for Thryv's Email Reliability team, which owns email sending end to end for all Keap products: user-facing features, compliance operations, and 24/7 on-call as an Email Service Provider sending up to 1B messages a month. Nine years on Keap products; still ships code daily. In 2026 led the team's move to AI coding agents (human review on every change) and to independent deploys. Result: merged PRs per week rose from 10 to 28 and median lead time to production fell from 9 days to 2.3.

---

## Experience

### Thryv (formerly Keap / Infusionsoft) · Remote (Phoenix, AZ) · Jul 2017 – present

Small-business marketing automation and CRM. Joined a founder-led company of ~400; acquired in 2024 by Thryv, a public company of ~3,000. Teams: Strategy Builder, which became Keap Pro's Easy Automations (2017 to early 2019); Platform (2019); Email Reliability since September 2019, including a 2020 to 2021 tour of duty leading the Merge API decomposition effort for Platform Services.

#### Manager, Product Engineering, Email Reliability · May 2025 – present

##### Team and delivery

- Manage 5 direct reports: 3 engineers, Thryv's Postmaster for all Keap products, and an email-compliance analyst. Hired 2 in 2025 who became high performers within months; zero voluntary attrition as manager.
- Accountable for sending, deliverability, and compliance at up to 1B emails/month at 99.9%+ uptime. Partner with Product to set priorities and business commitments against capacity, staffing, and technical feasibility.

##### AI enablement

- Cut median lead time to production from 9 days to 2.3 and nearly tripled merged PRs/week (10 to 28) by leading the team's adoption of human-reviewed AI coding agents and independent deploys; open customer-defect backlog fell from 28 to 12 and review volume rose ~3x.
- Ran the company's Claude Code pilot (late 2025); results informed the org-wide decision to adopt Claude Code and Cursor as primary AI tooling for ~50 engineers.
- Proposed, designed, and built the AI Email Engagement Summary, one of the product's first LLM features (Gemini on Vertex AI, RAG over Postmaster-written help content). It explains how a user's last 30 days of sending practices are helping or hurting deliverability and recommends fixes. Proof of concept in 1 week, beta in 5, 100% rollout 2 months after formal development began. Wrote the Promptfoo eval suite that gates every model change.
- Adapted OpenAI's open-source Symphony harness (via an internal fork two colleagues built) to dispatch Claude Code agents that pick up opted-in CVE tickets within a minute of intake and open PRs with the team's security-fix skill: 17 PRs across 7 services, ~80% hands-free, in month one.
- Wrote the governance for Thryv's Claude Code plugin marketplace; the team's marketplace (16 plugins, 130 merged PRs in 8 weeks) became the company template.

##### Platform and operations

- Moved all 9 team microservices (Java/Micronaut, Python, Go) off the weekly release train onto independent, gated production deploys, finishing in 9 weeks, 4 months ahead of schedule. Any engineer can now ship to production as soon as end-to-end, contract, load, and manual readiness tests pass.
- Own Email Reliability's 24/7 on-call program and take shifts in it; accountable for response, and serve as escalation lead for unacknowledged alerts. Separately, in the Engineering Manager rotation, back up the org's Incident Commander on P0/P1s. Built an on-call agent plugin (triage, mitigation, incident and runbook docs) and a weekly handoff skill for the incoming operator.
- Forecast monthly sending volume through 2026 for the annual MTA license renewal (quoted at +48%); matched the vendor's own reporting within ~1% and closed at my recommended tier, roughly flat year over year.

#### Software Engineer III / Tech Lead (player-coach), Email Reliability · Jul 2022 – May 2025
- Half coding, half management for a team of 5 through the Keap-to-Thryv acquisition.
- Owned Black Friday / Cyber Monday readiness four years running (2022–2025) with zero major incidents; 27.7M emails sent on Cyber Monday 2025.
- Incident lead for a 30-minute cloud-provider outage (Feb 2024): every send retried, none dead-lettered. Wrote the customer updates and the cross-team post-analysis.
- Hardened the engagement-tracking service ahead of Black Friday 2022: memory and cache fixes, one tracking domain per email, phishing-link blocking with an admin endpoint, and an autoscaling floor.

#### Software Engineer III, Email Reliability · Aug 2020 – Jul 2022
- Led the Merge API decomposition effort for the Platform Services team as a 2020 to 2021 tour of duty: moved Liquid template rendering out of the monolith into a standalone Java service, applying the lessons of the Contacts decomposition; first step of the email decomposition roadmap. Returned to Email Reliability when it shipped.
- Contributed 108 PRs to the Unlayer email builder that replaced the legacy editor. Built tracking-link domain rotation and warm-up so a blocklisted domain is swapped by configuration instead of a deploy. On call one week in six.

#### Software Engineer II · Jul 2018 – Aug 2020
- On the Platform team (2019): helped decompose the Contacts domain out of the Core monolith, moving Mobile's and Web's contact reads onto the new Contacts API (75 PRs).
- Built a resilience4j fault-tolerance library that eliminated thousands of failed sends during Black Friday 2019 traffic spikes; still the platform's outage pattern.
- Migrated Email Compliance's logging and alerting from Splunk to New Relic: BigQuery ingestion harness, rebuilt queries, feature-toggled cutover, 7 rebuilt alerts (46 PRs). Wrote Terraform, Kubernetes, and CircleCI deployment config for the content-risk and spam-scoring services.

#### Software Engineer I · Jul 2017 – Jul 2018
- Hired onto the Strategy Builder team, whose product became Keap Pro's Easy Automations; built parts of its Vue.js front end and early design-system components. Part of the hackathon whose Vue.js rebuild of the Max Classic UI became Keap Pro; shipped initial Keap Pro features (assisted follow-up email, hosted forms, in-app notifications).

**Earlier:** Freelance sound design and post-production, Chicago (2009–2015), including an award-winning branded film for Intel.

## Recognition
- **Thryv Accelerator Award, March 2026.** Company-wide recognition (~10 recipients a month); nominated by the team's product manager.
- **Thryv Emerging Leaders Program, 2025.** One of 23 selected company-wide for a seven-month leadership cohort.
- **Keap Better Together Award, December 2019.** Team recognition for an incident-free Black Friday / Cyber Monday on legacy email infrastructure.

## Selected Projects and Writing
- **Psychic Homily** (psychichomily.com): production site for Arizona music releases and shows, built solo in Next.js/React and Go.
- **decant** (github.com/mtrifilo/decant): open-source CLI that cleans clipboard content into Markdown for LLM context.
- **Writing and talks:** "From Typing Code to Agent Factories" (matttrifilo.com, 2026); three internal talks on agentic engineering.

## Skills
- **Engineering leadership:** hiring, performance management, capacity and roadmap planning, DORA metrics, on-call program ownership, incident command and postmortems, vendor negotiation
- **AI engineering:** Claude Code, Cursor, agentic workflows and orchestration, MCP, Gemini / Vertex AI, RAG, Promptfoo evals, prompt and context engineering
- **Languages and frameworks:** Java, Python, TypeScript, Go · Spring Boot, Micronaut, Flask, FastAPI · Vue.js, React, GraphQL
- **Infrastructure:** Google Cloud (GKE, Cloud Run, Pub/Sub, BigQuery, Vertex AI), Kubernetes, Terraform, GitHub Actions, CircleCI, Google Cloud Operations, OpsGenie
- **Email infrastructure:** MTA operations, DKIM/SPF, IP warm-up, deliverability, compliance

## Education

Bachelor's degree, Audio Arts & Acoustics, Columbia College Chicago · Certificate in Front End Web Development, freeCodeCamp, 2016
